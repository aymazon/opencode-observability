import { describe, expect, test } from "vitest";
import {
  attachClaudeSubagentLinks,
  buildClaudeMessages,
  extractClaudeMeta,
  extractClaudeModelBreakdown,
  extractClaudeSubagentTranscriptDirs,
  extractClaudeTodos,
  extractClaudeUsageTotals,
  parseClaudeTranscript,
} from "../../src/services/harness/claude/transcript-parser.js";

function transcript(lines: unknown[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

const SAMPLE = transcript([
  {
    type: "user",
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: "/repo",
    gitBranch: "main",
    message: { role: "user", content: "Hello" },
  },
  {
    type: "assistant",
    timestamp: "2026-01-01T00:00:05.000Z",
    message: {
      id: "msg-1",
      model: "claude-fable-5",
      role: "assistant",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 20,
      },
      content: [
        { type: "thinking", thinking: "Thinking" },
        { type: "text", text: "Let's do it" },
        {
          type: "tool_use",
          id: "tool-1",
          name: "Bash",
          input: { command: "ls" },
        },
        {
          type: "tool_use",
          id: "tool-skill",
          name: "Skill",
          input: { skill: "database-design", args: "Naming consideration" },
        },
      ],
    },
  },
  // Streamed continuation: same message.id, same usage — count once.
  {
    type: "assistant",
    timestamp: "2026-01-01T00:00:06.000Z",
    message: {
      id: "msg-1",
      model: "claude-fable-5",
      role: "assistant",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 20,
      },
      content: [{ type: "text", text: "Continuation" }],
    },
  },
  {
    type: "user",
    timestamp: "2026-01-01T00:00:07.000Z",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "file.txt",
          is_error: false,
        },
      ],
    },
  },
  {
    type: "assistant",
    timestamp: "2026-01-01T00:00:08.000Z",
    isSidechain: true,
    message: {
      id: "msg-2",
      model: "claude-haiku",
      role: "assistant",
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: "text", text: "Sub-task" }],
    },
  },
  {
    type: "assistant",
    timestamp: "2026-01-01T00:00:09.000Z",
    message: {
      id: "msg-3",
      model: "claude-fable-5",
      role: "assistant",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [
        {
          type: "tool_use",
          id: "tool-2",
          name: "TodoWrite",
          input: {
            todos: [
              { content: "Task 1", status: "completed" },
              { content: "Task 2", status: "pending" },
            ],
          },
        },
      ],
    },
  },
  { type: "ai-title", aiTitle: "Test session" },
]);

describe("claude transcript parser", () => {
  test("deduplicates streamed usage by message id", () => {
    const { records } = parseClaudeTranscript(SAMPLE);
    expect(extractClaudeUsageTotals(records)).toEqual({
      input: 111,
      output: 56,
      cacheRead: 30,
      cacheWrite: 20,
      total: 217,
    });
  });

  test("builds model breakdown with main/subagent scopes", () => {
    const { records } = parseClaudeTranscript(SAMPLE);
    expect(extractClaudeModelBreakdown(records)).toEqual([
      {
        scope: "main",
        agent: "main",
        modelId: "claude-fable-5",
        providerId: "anthropic",
        messageCount: 2,
        inputTokens: 101,
        outputTokens: 51,
        reasoningTokens: 0,
        cacheReadTokens: 30,
        cacheWriteTokens: 20,
        totalTokens: 202,
        totalCost: 0,
      },
      {
        scope: "subagent",
        agent: "subagent",
        modelId: "claude-haiku",
        providerId: "anthropic",
        messageCount: 1,
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 15,
        totalCost: 0,
      },
    ]);
  });

  test("extracts the latest TodoWrite call as todos", () => {
    const { records } = parseClaudeTranscript(SAMPLE);
    expect(extractClaudeTodos(records)).toEqual([
      { content: "Task 1", status: "completed", priority: "" },
      { content: "Task 2", status: "pending", priority: "" },
    ]);
  });

  test("builds messages with thinking, tool results and sidechain labels", () => {
    const { records } = parseClaudeTranscript(SAMPLE);
    const messages = buildClaudeMessages(records, { includeThinking: true });

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ["user", "Hello"],
      ["assistant", "Let's do it"],
      ["assistant", "Continuation"],
      ["assistant", "Sub-task"],
      ["assistant", ""],
    ]);

    expect(messages[1].toolCalls.map((call) => call.tool)).toEqual([
      "🧠 thinking",
      "Bash",
      "skill",
    ]);
    expect(messages[1].toolCalls[1]).toMatchObject({
      input: "ls",
      status: "completed",
      fullOutput: "file.txt",
    });
    // Skill invocations normalize to the lowercase "skill" tool with the skill
    // name as the label, matching the contract the sidebar aggregates on.
    expect(messages[1].toolCalls[2]).toMatchObject({
      tool: "skill",
      input: "database-design",
    });
    expect(messages[3].agent).toBe("subagent");
  });

  test("builds a structured question from AskUserQuestion and toolUseResult", () => {
    const content = transcript([
      {
        type: "assistant",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          id: "msg-q",
          model: "claude-fable-5",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-q",
              name: "AskUserQuestion",
              input: {
                questions: [
                  {
                    header: "Approach",
                    question: "Which approach should we take?",
                    multiSelect: false,
                    options: [
                      { label: "Speed first", description: "Fast" },
                      { label: "Safety first", description: "Solid" },
                    ],
                  },
                  {
                    header: "Target",
                    question: "Please select a target",
                    multiSelect: true,
                    options: [
                      { label: "API", description: "" },
                      { label: "UI", description: "" },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
      {
        type: "user",
        timestamp: "2026-01-01T00:00:05.000Z",
        // The structured answer lives at the record root, beside `message`.
        toolUseResult: {
          answers: {
            // String value (single select) and array value (multi select).
            "Which approach should we take?": "Speed first",
            "Please select a target": ["API", "UI"],
          },
        },
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-q",
              content: "User answered",
              is_error: false,
            },
          ],
        },
      },
    ]);

    const { records } = parseClaudeTranscript(content);
    const messages = buildClaudeMessages(records, { includeThinking: true });

    const call = messages[0].toolCalls[0];
    // AskUserQuestion is normalized to the shared "question" tool name.
    expect(call.tool).toBe("question");
    expect(call.input).toBe("2 questions");
    expect(call.question).toEqual({
      questions: [
        {
          header: "Approach",
          question: "Which approach should we take?",
          multiSelect: false,
          options: [
            { label: "Speed first", description: "Fast" },
            { label: "Safety first", description: "Solid" },
          ],
          selected: ["Speed first"],
          note: null,
        },
        {
          header: "Target",
          question: "Please select a target",
          multiSelect: true,
          options: [
            { label: "API", description: "" },
            { label: "UI", description: "" },
          ],
          selected: ["API", "UI"],
          note: null,
        },
      ],
    });
  });

  test("attaches subagent links to the assistant tool-use message", () => {
    const content = transcript([
      {
        type: "user",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "Investigate" },
      },
      {
        type: "assistant",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-fable-5",
          content: [
            {
              type: "tool_use",
              id: "tool-agent",
              name: "Agent",
              input: { description: "Investigate" },
            },
          ],
        },
      },
      {
        type: "user",
        timestamp: "2026-01-01T00:00:02.000Z",
        toolUseResult: {
          transcriptDir: "/tmp/session/subagents/workflows/wf-1",
        },
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-agent",
              content: "Workflow launched",
            },
          ],
        },
      },
    ]);

    const { records } = parseClaudeTranscript(content);
    const messages = buildClaudeMessages(records, { includeThinking: true });
    const transcriptDirs = extractClaudeSubagentTranscriptDirs(records);

    expect(transcriptDirs.get("/tmp/session/subagents/workflows/wf-1")).toBe(
      "tool-agent",
    );

    attachClaudeSubagentLinks(
      records,
      messages,
      new Map([
        [
          "tool-agent",
          [{ id: "agent-child", title: "Investigate", durationMs: 1234 }],
        ],
      ]),
      { includeThinking: true },
    );

    expect(messages[1].subagentLinks).toEqual([
      { id: "agent-child", title: "Investigate", durationMs: 1234 },
    ]);
  });

  test("extracts session metadata with deduplicated token totals", () => {
    const { records } = parseClaudeTranscript(SAMPLE);
    expect(extractClaudeMeta(records)).toEqual({
      title: "Test session",
      cwd: "/repo",
      gitBranch: "main",
      model: "claude-fable-5",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:09.000Z",
      tokensUsed: 217,
      messageCount: 6,
      firstUserMessage: "Hello",
    });
  });
});
