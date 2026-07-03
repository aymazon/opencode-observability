import { describe, expect, test } from "vitest";
import type { SessionMessageContract } from "../../src/contracts/session.js";
import {
  applyClaudeFilter,
  detectClaudeFilterContent,
  isSyntheticClaudeUserMessage,
} from "../../web/routes/session-detail/_lib/claude-filter.js";

function message(
  overrides: Partial<SessionMessageContract>,
): SessionMessageContract {
  return {
    role: "user",
    text: "",
    modelId: null,
    agent: null,
    outputTpsLabel: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    toolCalls: [],
    subagentLinks: [],
    fileDiffs: [],
    ...overrides,
  };
}

describe("claude-filter", () => {
  test("detects Claude Code cross-session notices emitted as user messages", () => {
    expect(
      isSyntheticClaudeUserMessage(
        message({ text: "Another Claude session sent a message" }),
      ),
    ).toBe(true);
  });

  test("normalizes surrounding and repeated whitespace in the fixed notice", () => {
    expect(
      isSyntheticClaudeUserMessage(
        message({ text: "  Another Claude   session sent a message\n" }),
      ),
    ).toBe(true);
  });

  test("detects structured teammate messages from another Claude session", () => {
    expect(
      isSyntheticClaudeUserMessage(
        message({
          text: `Another Claude session sent a message:
<teammate-message teammate_id="review-composition" color="blue">
{"type":"idle_notification","from":"review-composition"}
</teammate-message>

This came from another Claude session — not typed by your user.`,
        }),
      ),
    ).toBe(true);
  });

  test("detects structured agent messages from another Claude session", () => {
    expect(
      isSyntheticClaudeUserMessage(
        message({
          text: `Another Claude session sent a message:
<agent-message from="review-composition">
Review complete.
</agent-message>`,
        }),
      ),
    ).toBe(true);
  });

  test("does not match unrelated user text that only mentions the phrase", () => {
    expect(
      isSyntheticClaudeUserMessage(
        message({
          text: "Another Claude session sent a message, but I want to discuss that wording.",
        }),
      ),
    ).toBe(false);
  });

  test("does not match assistant messages with the same text", () => {
    expect(
      isSyntheticClaudeUserMessage(
        message({
          role: "assistant",
          text: "Another Claude session sent a message",
        }),
      ),
    ).toBe(false);
  });

  test("detects when any message is filterable", () => {
    expect(
      detectClaudeFilterContent([
        message({ text: "Keep this" }),
        message({ text: "Another Claude session sent a message" }),
      ]),
    ).toBe(true);
  });

  test("removes only synthetic Claude user notices", () => {
    const visible = message({ text: "Human prompt" });
    const notice = message({ text: "Another Claude session sent a message" });
    const assistant = message({
      role: "assistant",
      text: "Another Claude session sent a message",
    });

    expect(applyClaudeFilter([visible, notice, assistant])).toEqual([
      visible,
      assistant,
    ]);
  });
});
