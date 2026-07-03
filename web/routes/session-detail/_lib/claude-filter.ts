import type { SessionMessageContract } from "../../../../src/contracts/session.js";

// Claude Code can emit user-role records for internal cross-session notices.
// Keep this list intentionally narrow to avoid hiding genuine user prompts.
const SYNTHETIC_USER_TEXTS = new Set(["Another Claude session sent a message"]);
const SYNTHETIC_PREFIX_PATTERN =
  /^Another Claude session sent a message:\s*<(?:teammate-message|agent-message)\b/;

function normalizeSyntheticText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isSyntheticClaudeUserMessage(
  message: SessionMessageContract,
): boolean {
  if (message.role !== "user") return false;
  const normalized = normalizeSyntheticText(message.text);
  return (
    SYNTHETIC_USER_TEXTS.has(normalized) ||
    SYNTHETIC_PREFIX_PATTERN.test(message.text.trimStart())
  );
}

export function detectClaudeFilterContent(
  messages: SessionMessageContract[],
): boolean {
  return messages.some(isSyntheticClaudeUserMessage);
}

export function applyClaudeFilter(
  messages: SessionMessageContract[],
): SessionMessageContract[] {
  return messages.filter((message) => !isSyntheticClaudeUserMessage(message));
}
