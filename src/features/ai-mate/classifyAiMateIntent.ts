import type { AiMateIntent } from "../../domain/types";

export function classifyAiMateIntent(rawMessage: string): AiMateIntent {
  const message = rawMessage.trim().replace(/\s+/g, " ");
  if (!message) return "unknown";
  if (/(아냐|아니|자동).*(취소|되돌)|취소해줘|되돌려줘/.test(message)) return "undo-update";
  if (/(왜|이유|근거|설명)/.test(message)) return "explain";
  if (/(주간\s*계획).*(업데이트)|업데이트.*(계획)/.test(message)) return "update-plan";
  if (/(도움|무엇을 할 수|사용법|어떻게 써)/.test(message)) return "help";
  if (/주간\s*계획\s*(?:을\s*)?(?:생성|짜)|(?:이번 주|7일)\s*계획.*(?:생성|짜)/.test(message)) return "generate-plan";
  // Existing-plan language and explicit modification verbs take precedence
  // over broad creation words such as "만들어" inside a constraint.
  if (/(현재|기존)\s*주간\s*계획|주간\s*계획.*(수정|조정)|(?:수정|조정|옮겨|줄여|늘려)\s*(?:줘|해)/.test(message)) return "adjust-plan";
  // A generation prompt can legitimately contain adjustment words in its
  // requirements. The explicit creation phrase owns the intent.
  if (/(계획).*(짜|만들|생성)|(이번 주|7일).*(짜|계획)/.test(message)) return "generate-plan";
  if (/(줄여|옮겨|바꿔|조정|수정|늘려|가볍게|우선)/.test(message)) return "adjust-plan";
  return "unknown";
}
