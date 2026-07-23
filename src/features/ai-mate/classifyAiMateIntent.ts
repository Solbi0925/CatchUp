import type { AiMateIntent } from "../../domain/types";

export function classifyAiMateIntent(rawMessage: string): AiMateIntent {
  const message = rawMessage.trim().replace(/\s+/g, " ");
  if (!message) return "unknown";
  if (/(왜|이유|근거|설명)/.test(message)) return "explain";
  if (/(도움|무엇을 할 수|사용법|어떻게 써)/.test(message)) return "help";
  if (/(줄여|옮겨|바꿔|조정|가볍게|우선)/.test(message)) return "adjust-plan";
  if (/(계획).*(짜|만들|생성)|이번 주.*(짜|계획)/.test(message)) return "generate-plan";
  return "unknown";
}
