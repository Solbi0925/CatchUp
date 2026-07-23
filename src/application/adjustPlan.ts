import type { AdjustmentResult, OperationId, Todo } from "../domain/types";

interface AdjustPlanInput {
  operationId: OperationId;
  requestText: string;
  requestedAt: string;
  todos: Todo[];
}

const dayTargets = [
  { pattern: /월요일/, date: "2026-07-20", nextDate: "2026-07-21" },
  { pattern: /화요일/, date: "2026-07-21", nextDate: "2026-07-22" },
  { pattern: /수요일/, date: "2026-07-22", nextDate: "2026-07-23" },
  { pattern: /목요일/, date: "2026-07-23", nextDate: "2026-07-24" },
  { pattern: /금요일/, date: "2026-07-24", nextDate: "2026-07-25" },
  { pattern: /토요일/, date: "2026-07-25", nextDate: "2026-07-26" },
  { pattern: /일요일/, date: "2026-07-26", nextDate: "2026-07-25" },
];

export function adjustMockPlan(input: AdjustPlanInput): AdjustmentResult {
  const target = dayTargets.find(({ pattern }) => pattern.test(input.requestText));
  const candidate = target
    ? [...input.todos]
        .filter((todo) => todo.scheduledDate === target.date && !todo.isCompleted)
        .sort((left, right) => right.estimatedDurationMinutes - left.estimatedDurationMinutes)[0]
    : undefined;
  const changed = Boolean(target && candidate);
  const todos =
    target && candidate
      ? input.todos.map((todo) =>
          todo.id === candidate.id
            ? {
                ...todo,
                scheduledDate: target.nextDate,
                recommendationReason: `${target.date}의 부담을 줄여 다른 날로 조정했어요.`,
              }
            : todo,
        )
      : input.todos;

  return {
    operationId: input.operationId,
    todos,
    changed,
    assistantMessage: {
      id: `assistant-${input.operationId}`,
      role: "assistant",
      text: changed
        ? "요청한 날의 부담이 줄도록 계획을 조정했어요."
        : "바꿀 수 있는 해당 날짜의 할 일을 찾지 못했어요. 다른 방식으로 알려주세요.",
      createdAt: input.requestedAt,
      status: "sent",
      intent: "adjust-plan",
      operationId: input.operationId,
    },
  };
}
