import type { AdjustmentResult, OperationId, Todo } from "../domain/types";

interface AdjustPlanInput {
  operationId: OperationId;
  requestText: string;
  requestedAt: string;
  planStartDate?: string;
  todos: Todo[];
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function createDayTargets(planStartDate: string) {
  const weekdayPatterns = [/일요일/, /월요일/, /화요일/, /수요일/, /목요일/, /금요일/, /토요일/];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(planStartDate, index);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return {
      pattern: weekdayPatterns[weekday],
      date,
      nextDate: addDays(planStartDate, index === 6 ? 5 : index + 1),
    };
  });
}

export function adjustMockPlan(input: AdjustPlanInput): AdjustmentResult {
  const dayTargets = createDayTargets(input.planStartDate ?? "2026-07-22");
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
