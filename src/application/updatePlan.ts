import { generateMockWeeklyPlan, scheduleAcademicEventTodos } from "./mockPlanEngine";
import type { AdjustmentResult, ExtractedItem, GeneratePlanCommand, PlanDiff, Todo, WeeklyPlan } from "../domain/types";
import { effectiveDailyStudyCapacity, parsePlanConstraints, scheduledMinutesByDate, validatePlanConstraints } from "./planConstraints";

interface UpdatePlanInput {
  command: GeneratePlanCommand;
  weeklyPlan: WeeklyPlan;
  todos: Todo[];
  affectedAcademicEventIds: string[];
  previousAcademicEvents?: ExtractedItem[];
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function buildDiff(input: UpdatePlanInput, before: Todo[], after: Todo[]): PlanDiff {
  const beforeById = new Map(before.map((todo) => [todo.id, todo])); const afterById = new Map(after.map((todo) => [todo.id, todo]));
  const addedTaskIds = after.filter((todo) => !beforeById.has(todo.id)).map((todo) => todo.id);
  const removedTaskIds = before.filter((todo) => !afterById.has(todo.id)).map((todo) => todo.id);
  const movedTasks = after.flatMap((todo) => { const previous = beforeById.get(todo.id); return previous && previous.scheduledDate !== todo.scheduledDate ? [{ taskId: todo.id, from: previous.scheduledDate, to: todo.scheduledDate }] : []; });
  const durationChanges = after.flatMap((todo) => { const previous = beforeById.get(todo.id); return previous && previous.estimatedDurationMinutes !== todo.estimatedDurationMinutes ? [{ taskId: todo.id, beforeMinutes: previous.estimatedDurationMinutes, afterMinutes: todo.estimatedDurationMinutes }] : []; });
  const changedTaskIds = [...new Set([...addedTaskIds, ...removedTaskIds, ...movedTasks.map((item) => item.taskId), ...durationChanges.map((item) => item.taskId)])];
  return { triggeringChange: input.command.extractedItems.filter((item) => input.affectedAcademicEventIds.includes(item.id)).map((item) => item.title).join(", ") || "개인 일정 변경", addedTaskIds, removedTaskIds, changedTaskIds, movedTasks, durationChanges, reasons: ["새로 확인된 사실과 직접 연결된 미완료 task만 비교함", "완료 task와 관련 없는 task는 보존함"] };
}

function updateReasonText(input: UpdatePlanInput, before: Todo[], after: Todo[], diff: PlanDiff) {
  const names = input.command.extractedItems.filter((item) => input.affectedAcademicEventIds.includes(item.id)).map((item) => item.title);
  const previousNames = input.affectedAcademicEventIds.filter((id) => !input.command.extractedItems.some((item) => item.id === id));
  const source = names.length ? `${names.join(", ")}의 새 정보를` : previousNames.length ? "삭제된 학업 일정을" : "새 개인 일정을";
  const beforeById = new Map(before.map((todo) => [todo.id, todo])); const afterById = new Map(after.map((todo) => [todo.id, todo]));
  const details = [
    ...diff.movedTasks.map((move) => `${afterById.get(move.taskId)?.title ?? "할 일"}을 ${move.from}에서 ${move.to}로 이동`),
    ...diff.addedTaskIds.map((id) => `${afterById.get(id)?.title ?? "할 일"}을 ${afterById.get(id)?.scheduledDate ?? "계획 기간"}에 추가`),
    ...diff.removedTaskIds.map((id) => `${beforeById.get(id)?.title ?? "할 일"}을 제거`),
    ...diff.durationChanges.map((change) => `${afterById.get(change.taskId)?.title ?? "할 일"} 시간을 ${change.beforeMinutes}분에서 ${change.afterMinutes}분으로 변경`),
  ].slice(0, 3);
  const remainder = Math.max(0, diff.changedTaskIds.length - details.length);
  const changeSummary = details.length ? `${details.join(", ")}${remainder ? ` 외 ${remainder}개` : ""}` : "현재 계획을 다시 확인";
  const evidence = diff.addedTaskIds.concat(diff.movedTasks.map((item) => item.taskId))
    .flatMap((id) => afterById.get(id)?.recommendationDetails?.placementReasons ?? []).slice(0, 2);
  return `${source} 반영해 ${changeSummary}했어요.${evidence.length ? ` ${evidence.join("; ")}.` : ""} 원하지 않으면 취소할 수 있어요!`;
}

function isTinyClassScheduleChange(input: UpdatePlanInput) {
  if (!input.affectedAcademicEventIds.length || !input.previousAcademicEvents?.length) return false;
  return input.affectedAcademicEventIds.every((id) => {
    const before = input.previousAcademicEvents?.find((item) => item.id === id); const after = input.command.extractedItems.find((item) => item.id === id);
    if (!before || !after || before.itemType !== "class-schedule" || after.itemType !== "class-schedule" || before.classMeetingTimes.length !== after.classMeetingTimes.length) return false;
    return before.classMeetingTimes.every((meeting) => { const next = after.classMeetingTimes.find((candidate) => candidate.id === meeting.id); if (!next || next.weekday !== meeting.weekday || next.startTime !== meeting.startTime || next.location !== meeting.location) return false; const toMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }; return Math.abs(toMinutes(next.endTime) - toMinutes(meeting.endTime)) <= 5; });
  });
}

export function updateMockPlan(input: UpdatePlanInput): AdjustmentResult {
  if (isTinyClassScheduleChange(input)) {
    return { operationId: input.command.operationId, todos: input.todos, changed: false, changedTodoIds: [], planDiff: buildDiff(input, input.todos, input.todos), assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent", intent: "update-plan", operationId: input.command.operationId, text: "수업 시간의 작은 변경은 기존 학습 계획에 실질적인 영향을 주지 않아 계획을 그대로 유지했어요." } };
  }
  if (!input.affectedAcademicEventIds.length) {
    const constraints = parsePlanConstraints(input.weeklyPlan.generationRequest);
    const loads = new Map<string, number>();
    input.todos.filter((todo) => !todo.isCompleted).forEach((todo) => loads.set(todo.scheduledDate, (loads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes));
    const scheduledLoads = scheduledMinutesByDate(input.weeklyPlan, input.command.calendarEvents, input.command.extractedItems);
    const countOn = (date: string) => input.todos.filter((todo) => !todo.isCompleted && todo.scheduledDate === date).length;
    const byId = new Map(input.todos.map((todo) => [todo.id, todo]));
    const moved: Todo[] = [];
    const todos = input.todos.map((todo) => {
      const currentCapacity = effectiveDailyStudyCapacity(todo.scheduledDate, constraints, scheduledLoads, input.command.planningProfile.maxDailyStudyMinutes ?? 240);
      if (todo.isCompleted || (loads.get(todo.scheduledDate) ?? 0) <= currentCapacity) return todo;
      const source = input.command.extractedItems.find((item) => item.id === todo.sourceExtractedItemId);
      const predecessor = todo.dependsOnTodoId ? byId.get(todo.dependsOnTodoId) : undefined;
      const successor = input.todos.find((candidate) => candidate.dependsOnTodoId === todo.id);
      const candidates = Array.from({ length: 7 }, (_, index) => addDays(input.weeklyPlan.weekStartDate, index))
        .filter((date) => {
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
          const maximum = constraints.maxTasksByWeekday[weekday];
          return date !== todo.scheduledDate && (!source?.date || date < source.date)
            && (!predecessor || date > predecessor.scheduledDate) && (!successor || date < successor.scheduledDate)
            && !constraints.prohibitedWeekdays.includes(weekday) && (maximum === undefined || countOn(date) < maximum)
            && (loads.get(date) ?? 0) + todo.estimatedDurationMinutes <= effectiveDailyStudyCapacity(date, constraints, scheduledLoads, input.command.planningProfile.maxDailyStudyMinutes ?? 240);
        })
        .sort((left, right) => {
          const leftWeekday = new Date(`${left}T00:00:00Z`).getUTCDay(); const rightWeekday = new Date(`${right}T00:00:00Z`).getUTCDay();
          return Number(!constraints.preferredWeekdays.includes(leftWeekday)) - Number(!constraints.preferredWeekdays.includes(rightWeekday))
            || ((loads.get(left) ?? 0) + (scheduledLoads.get(left) ?? 0)) - ((loads.get(right) ?? 0) + (scheduledLoads.get(right) ?? 0)) || left.localeCompare(right);
        });
      const destination = candidates[0];
      if (!destination) return todo;
      loads.set(todo.scheduledDate, Math.max(0, (loads.get(todo.scheduledDate) ?? 0) - todo.estimatedDurationMinutes));
      loads.set(destination, (loads.get(destination) ?? 0) + todo.estimatedDurationMinutes);
      const next = { ...todo, scheduledDate: destination, recommendationReason: `새 개인 일정과 겹치지 않도록 ${destination}로 이동했어요.`, recommendationDetails: todo.recommendationDetails ? { ...todo.recommendationDetails, placementReasons: [`새 개인 일정과 겹치지 않도록 ${destination}로 이동함`] } : undefined };
      moved.push(next);
      return next;
    });
    const changed = moved.length > 0;
    const finalTodos = changed ? todos : input.todos; const diff = buildDiff(input, input.todos, finalTodos);
    const validation = validatePlanConstraints(finalTodos, constraints, input.weeklyPlan, input.command.extractedItems, input.todos, undefined, input.command.calendarEvents, input.command.planningProfile.maxDailyStudyMinutes ?? 240);
    if (!validation.ok) return { operationId: input.command.operationId, todos: input.todos, changed: false, changedTodoIds: [], planDiff: buildDiff(input, input.todos, input.todos), assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent", intent: "update-plan", operationId: input.command.operationId, text: `기존 계획 조건을 지키지 못해 자동 업데이트를 적용하지 않았어요. ${validation.violations.join(", ")}` } };
    const text = changed ? updateReasonText(input, input.todos, finalTodos, diff) : "새 일정을 확인했지만 현재 주간계획과 충돌하지 않아 계획은 바꾸지 않았어요.";
    return { operationId: input.command.operationId, todos: finalTodos, changed, changedTodoIds: diff.changedTaskIds, planDiff: diff, assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent", intent: "update-plan", operationId: input.command.operationId, text } };
  }
  const affected = new Set(input.affectedAcademicEventIds);
  const completed = input.todos.filter((todo) => todo.isCompleted);
  const retained = input.todos.filter((todo) => !todo.isCompleted && !affected.has(todo.sourceExtractedItemId));
  const completedKeys = new Set(completed.map((todo) => `${todo.sourceExtractedItemId}:${todo.title}`));
  const previousPending = input.todos.filter((todo) => !todo.isCompleted && affected.has(todo.sourceExtractedItemId));
  const affectedItems = input.command.extractedItems.filter((item) => affected.has(item.id) && item.itemType !== "class-schedule" && item.confirmationStatus === "confirmed" && item.date);
  const generated = scheduleAcademicEventTodos(input.command, affectedItems, input.weeklyPlan, input.weeklyPlan.id, retained, completed);
  const generatedAffected = generated.todos.filter((todo) => !completedKeys.has(`${todo.sourceExtractedItemId}:${todo.title}`));
  const previousByEvent = new Map<string, Todo[]>(); previousPending.forEach((todo) => previousByEvent.set(todo.sourceExtractedItemId, [...(previousByEvent.get(todo.sourceExtractedItemId) ?? []), todo]));
  const generatedIndexByEvent = new Map<string, number>();
  const generatedToRefreshedId = new Map<string, string>();
  const refreshed = generatedAffected.map((todo) => {
    const index = generatedIndexByEvent.get(todo.sourceExtractedItemId) ?? 0; generatedIndexByEvent.set(todo.sourceExtractedItemId, index + 1);
    const existing = previousByEvent.get(todo.sourceExtractedItemId)?.[index];
    const id = existing?.id ?? `updated-${input.command.operationId}-${todo.sourceExtractedItemId}-${todo.id.split("-").pop()}`;
    generatedToRefreshedId.set(todo.id, id);
    return ({
      ...todo,
      id,
      weeklyPlanId: input.weeklyPlan.id,
    });
  }).map((todo) => ({ ...todo, dependsOnTodoId: todo.dependsOnTodoId ? generatedToRefreshedId.get(todo.dependsOnTodoId) ?? todo.dependsOnTodoId : null }));
  const todos = [...completed, ...retained, ...refreshed];
  const before = JSON.stringify(previousPending.map(({ id: _id, ...todo }) => todo));
  const after = JSON.stringify(refreshed.map(({ id: _id, ...todo }) => todo));
  const changed = before !== after;
  const finalTodos = changed ? todos : input.todos;
  const validation = generated.violations.length
    ? { ok: false, violations: generated.violations }
    : validatePlanConstraints(finalTodos, parsePlanConstraints(input.weeklyPlan.generationRequest), input.weeklyPlan, input.command.extractedItems, input.todos, affected, input.command.calendarEvents, input.command.planningProfile.maxDailyStudyMinutes ?? 240);
  if (!validation.ok) return { operationId: input.command.operationId, todos: input.todos, changed: false, changedTodoIds: [], planDiff: buildDiff(input, input.todos, input.todos), assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent", intent: "update-plan", operationId: input.command.operationId, text: `기존 계획 조건을 지키지 못해 자동 업데이트를 적용하지 않았어요. ${validation.violations.join(", ")}` } };
  const diff = buildDiff(input, input.todos, finalTodos);
  const text = changed ? updateReasonText(input, input.todos, finalTodos, diff) : "새 정보를 확인했지만 현재 주간계획에서 바꿀 부분은 없었어요.";
  return {
    operationId: input.command.operationId,
    todos: finalTodos,
    changed,
    changedTodoIds: diff.changedTaskIds,
    planDiff: diff,
    assistantMessage: {
      id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt,
      status: "sent", intent: "update-plan", operationId: input.command.operationId,
      text,
    },
  };
}
