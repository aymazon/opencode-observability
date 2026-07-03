import type { SessionMessageContract } from "../../../../src/contracts/session.js";
import { applyClaudeFilter } from "./claude-filter";
import { applyOmoFilter } from "./omo-filter";

export interface SessionMessageFilterOptions {
  claude: boolean;
  omo: boolean;
}

export function applySessionMessageFilters(
  messages: SessionMessageContract[],
  options: SessionMessageFilterOptions,
): SessionMessageContract[] {
  let result = messages;
  if (options.omo) result = applyOmoFilter(result);
  if (options.claude) result = applyClaudeFilter(result);
  return result;
}
