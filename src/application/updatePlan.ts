import { generateMockWeeklyPlan } from "./mockPlanEngine";
import type { AdjustmentResult, GeneratePlanCommand, Todo, WeeklyPlan } from "../domain/types";

interface UpdatePlanInput {
  command: GeneratePlanCommand;
  weeklyPlan: WeeklyPlan;
  todos: Todo[];
  affectedAcademicEventIds: string[];
}

export function updateMockPlan(input: UpdatePlanInput): AdjustmentResult {
  if (!input.affectedAcademicEventIds.length) return {
    operationId: input.command.operationId,
    todos: input.todos,
    changed: false,
    changedTodoIds: [],
    assistantMessage: {
      id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt,
      status: "sent", intent: "update-plan", operationId: input.command.operationId,
      text: "현재 주간계획에 반영할 새로운 학업 정보가 없어요.",
    },
  };
  const affected = new Set(input.affectedAcademicEventIds);
  const generated = generateMockWeeklyPlan({ ...input.command, existingWeeklyPlan: null });
  const completed = input.todos.filter((todo) => todo.isCompleted);
  const retained = input.todos.filter((todo) => !todo.isCompleted && !affected.has(todo.sourceExtractedItemId));
  const completedKeys = new Set(completed.map((todo) => `${todo.sourceExtractedItemId}:${todo.title}`));
  const refreshed = generated.todos
    .filter((todo) => affected.has(todo.sourceExtractedItemId) && !completedKeys.has(`${todo.sourceExtractedItemId}:${todo.title}`))
    .map((todo) => ({
      ...todo,
      id: `updated-${input.command.operationId}-${todo.sourceExtractedItemId}-${todo.id.split("-").pop()}`,
      weeklyPlanId: input.weeklyPlan.id,
      recommendationReason: "새롭게 확인된 학업 정보를 반영해 남은 계획을 다시 배치했어요.",
      recommendationDetails: todo.recommendationDetails ? {
        ...todo.recommendationDetails,
        placementReasons: ["새롭게 확인된 학업 정보를 반영해 남은 계획을 다시 배치함"],
      } : undefined,
    }));
  const todos = [...completed, ...retained, ...refreshed];
  const previousPending = input.todos.filter((todo) => !todo.isCompleted && affected.has(todo.sourceExtractedItemId));
  const before = JSON.stringify(previousPending.map(({ id: _id, ...todo }) => todo));
  const after = JSON.stringify(refreshed.map(({ id: _id, ...todo }) => todo));
  const changed = before !== after;
  return {
    operationId: input.command.operationId,
    todos: changed ? todos : input.todos,
    changed,
    changedTodoIds: changed ? [...previousPending.map((todo) => todo.id), ...refreshed.map((todo) => todo.id)] : [],
    assistantMessage: {
      id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt,
      status: "sent", intent: "update-plan", operationId: input.command.operationId,
      text: changed ? "새로운 학업 정보를 반영해 미완료 주간계획을 업데이트했어요. 완료한 할 일은 그대로 유지했어요." : "새 정보를 검토했지만 현재 주간계획에서 바꿀 부분은 없었어요.",
    },
  };
}
