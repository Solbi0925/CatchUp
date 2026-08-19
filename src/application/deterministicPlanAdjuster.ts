import type { AdjustmentResult, CalendarEvent, ExtractedItem, OperationId, Todo, WeeklyPlan } from "../domain/types";
import { effectiveDailyStudyCapacity, parsePlanConstraints, rebalancePlanToConstraints, scheduledMinutesByDate, validatePlanConstraints } from "./planConstraints";

export interface AdjustPlanInput {
  operationId: OperationId;
  requestText: string;
  requestedAt: string;
  weeklyPlan?: WeeklyPlan;
  weekStartDate?: string;
  todos: Todo[];
  academicEvents?: ExtractedItem[];
  calendarEvents?: CalendarEvent[];
  maxDailyStudyMinutes?: number | null;
  selectedTodoId?: string | null;
}

const weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const weekdayNumbers = [1, 2, 3, 4, 5, 6, 0];

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateForWeekdayInPlan(weekStartDate: string, weekdayIndex: number) {
  const weekdayNumber = weekdayNumbers[weekdayIndex];
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(weekStartDate, offset);
    if (new Date(`${candidate}T00:00:00Z`).getUTCDay() === weekdayNumber) return candidate;
  }
  return weekStartDate;
}

function movable(todo: Todo) {
  return !todo.isCompleted && todo.planningParticipation !== "calendar-only";
}

function nextClassDate(event: ExtractedItem, earliestDate: string) {
  const weekdays = new Set<number>(event.classMeetingTimes.map((meeting) => meeting.weekday));
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addDays(earliestDate, offset);
    if (weekdays.has(new Date(`${date}T00:00:00Z`).getUTCDay())) return date;
  }
  return null;
}

function withAdjustmentReason(todo: Todo, reason: string): Todo {
  return {
    ...todo,
    recommendationReason: reason,
    recommendationDetails: todo.recommendationDetails ? {
      ...todo.recommendationDetails,
      placementReasons: [reason],
      userRequestReasons: [...todo.recommendationDetails.userRequestReasons, reason],
    } : undefined,
  };
}

function message(input: AdjustPlanInput, text: string, changed: boolean, todos: Todo[], changedTodoIds: string[]): AdjustmentResult {
  return {
    operationId: input.operationId,
    todos,
    changed,
    changedTodoIds,
    assistantMessage: {
      id: `assistant-${input.operationId}`,
      role: "assistant",
      text,
      createdAt: input.requestedAt,
      status: "sent",
      intent: "adjust-plan",
      operationId: input.operationId,
    },
  };
}

function respectsAcademicDate(todo: Todo, targetDate: string, academicEvents: ExtractedItem[]) {
  const event = academicEvents.find((item) => item.id === todo.sourceExtractedItemId);
  return !event?.date || targetDate <= event.date;
}

const phaseOrder = { prepare: 0, research: 1, draft: 2, work: 3, review: 4, finalize: 5 } as const;

function schedulingPhase(todo: Todo): keyof typeof phaseOrder {
  const title = todo.title.replace(/\s+/g, " ");
  // Older saved plans can predate taskPhase/dependsOnTodoId. Strong action words in
  // the persisted title still let deadline rebalancing preserve the obvious flow.
  if (/(마무리|최종|제출 준비)/.test(title)) return "finalize";
  if (/(검토|점검|피드백)/.test(title)) return "review";
  if (/(초안|아웃라인|개요).*(작성|만들)|초안/.test(title)) return "draft";
  if (/(요구사항|조건).*(확인|정리)|자료 (?:조사|정리)|리서치(?:하기| 시작| 진행)/.test(title)) return "research";
  if (/(준비|확인)/.test(title)) return "prepare";
  return todo.taskPhase ?? "work";
}

function resolveSelectedTodo(input: AdjustPlanInput, request: string) {
  const selectedById = input.todos.find((todo) => todo.id === input.selectedTodoId && movable(todo));
  if (selectedById) return selectedById;
  const quotedTitle = request.match(/['"]([^'"]+)['"]/)?.[1]?.trim();
  if (!quotedTitle) return undefined;
  const matches = input.todos.filter((todo) => movable(todo) && todo.title === quotedTitle);
  return matches.length === 1 ? matches[0] : undefined;
}

function rebalanceBeforeDeadline(input: AdjustPlanInput, selected: Todo, request: string, weekStartDate: string, weekEndDate: string, academicEvents: ExtractedItem[]) {
  const event = academicEvents.find((item) => item.id === selected.sourceExtractedItemId && item.confirmationStatus === "confirmed");
  if (!event?.date) return message(input, "연결된 확정 학업 이벤트의 정확한 마감일을 찾지 못해 계획을 변경하지 않았어요.", false, input.todos, []);
  const tasks = input.todos.filter((todo) => movable(todo) && todo.sourceExtractedItemId === event.id)
    .sort((left, right) => (phaseOrder[schedulingPhase(left)] - phaseOrder[schedulingPhase(right)]) || left.scheduledDate.localeCompare(right.scheduledDate));
  if (!tasks.length) return message(input, "마감 전에 재배치할 미완료 할 일을 찾지 못했어요.", false, input.todos, []);
  const earliest = input.requestedAt.slice(0, 10) > weekStartDate ? input.requestedAt.slice(0, 10) : weekStartDate;
  const lastDate = event.date <= weekEndDate ? addDays(event.date, -1) : weekEndDate;
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)).filter((date) => date >= earliest && date <= lastDate);
  if (dates.length < tasks.length) return message(input, `마감 전 계획 범위에 선후관계를 지킬 날짜가 ${dates.length}일뿐이라 ${tasks.length}개 작업을 안전하게 재배치할 수 없어요.`, false, input.todos, []);

  const constraints = parsePlanConstraints(`${input.weeklyPlan?.generationRequest ?? ""}. ${request}`);
  const scheduledLoads = scheduledMinutesByDate({ weekStartDate, weekEndDate }, input.calendarEvents ?? [], academicEvents);
  const taskLoads = new Map<string, number>();
  input.todos.filter((todo) => movable(todo) && todo.sourceExtractedItemId !== event.id)
    .forEach((todo) => taskLoads.set(todo.scheduledDate, (taskLoads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes));
  const taskCounts = new Map<string, number>();
  input.todos.filter((todo) => movable(todo) && todo.sourceExtractedItemId !== event.id)
    .forEach((todo) => taskCounts.set(todo.scheduledDate, (taskCounts.get(todo.scheduledDate) ?? 0) + 1));
  const assignments = new Map<string, string>();
  let minimumIndex = 0;
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    const task = tasks[taskIndex];
    const latestIndex = dates.length - (tasks.length - taskIndex);
    const candidate = dates.map((date, index) => ({ date, index })).filter(({ date, index }) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const countLimit = constraints.maxTasksByWeekday[weekday];
      return index >= minimumIndex && index <= latestIndex && !constraints.prohibitedWeekdays.includes(weekday)
        && (countLimit === undefined || (taskCounts.get(date) ?? 0) + 1 <= countLimit)
        && (taskLoads.get(date) ?? 0) + task.estimatedDurationMinutes <= effectiveDailyStudyCapacity(date, constraints, scheduledLoads, input.maxDailyStudyMinutes ?? null);
    }).sort((left, right) => ((taskLoads.get(left.date) ?? 0) + (scheduledLoads.get(left.date) ?? 0)) - ((taskLoads.get(right.date) ?? 0) + (scheduledLoads.get(right.date) ?? 0)) || left.index - right.index)[0];
    if (!candidate) return message(input, `마감 전 남은 날짜의 학습 한도와 예정 일정 때문에 '${task.title}'을 배치할 수 없어요. 기존 계획을 유지했어요.`, false, input.todos, []);
    assignments.set(task.id, candidate.date); minimumIndex = candidate.index + 1;
    taskLoads.set(candidate.date, (taskLoads.get(candidate.date) ?? 0) + task.estimatedDurationMinutes);
    taskCounts.set(candidate.date, (taskCounts.get(candidate.date) ?? 0) + 1);
  }
  const changedTodoIds = tasks.filter((todo) => assignments.get(todo.id) !== todo.scheduledDate).map((todo) => todo.id);
  if (!changedTodoIds.length) return message(input, "현재 작업 순서와 날짜가 이미 마감 전 학습량에 맞게 배치되어 있어요.", false, input.todos, []);
  const changed = new Set(changedTodoIds);
  const todos = input.todos.map((todo) => changed.has(todo.id)
    ? withAdjustmentReason({ ...todo, scheduledDate: assignments.get(todo.id)! }, `${event.date} 마감 전 선후관계와 날짜별 학습량을 반영해 ${assignments.get(todo.id)}로 재배치했어요.`)
    : todo);
  return message(input, `${event.title}의 남은 작업을 마감 전 날짜에 순서대로 분산했어요.`, true, todos, changedTodoIds);
}

function rebalanceBeforeClass(input: AdjustPlanInput, selected: Todo, request: string, weekStartDate: string, weekEndDate: string, academicEvents: ExtractedItem[]) {
  const event = academicEvents.find((item) => item.id === selected.sourceExtractedItemId
    && item.confirmationStatus === "confirmed" && item.itemType === "class-schedule");
  if (!event?.classMeetingTimes.length) {
    return message(input, "연결된 수업의 요일과 시간을 확인하지 못해 계획을 변경하지 않았어요.", false, input.todos, []);
  }

  const classDate = nextClassDate(event, weekStartDate);
  if (!classDate || classDate > weekEndDate) {
    return message(input, "현재 주간계획 기간에 해당 수업을 찾지 못해 계획을 변경하지 않았어요.", false, input.todos, []);
  }
  if (selected.scheduledDate <= classDate) {
    return message(input, `선택한 할 일은 이미 ${classDate} 수업일이나 그 전에 배치되어 있어요.`, false, input.todos, []);
  }

  const constraints = parsePlanConstraints(`${input.weeklyPlan?.generationRequest ?? ""}. ${request}`);
  const scheduledLoads = scheduledMinutesByDate({ weekStartDate, weekEndDate }, input.calendarEvents ?? [], academicEvents);
  const taskLoads = new Map<string, number>();
  const taskCounts = new Map<string, number>();
  input.todos.filter((todo) => movable(todo) && todo.id !== selected.id).forEach((todo) => {
    taskLoads.set(todo.scheduledDate, (taskLoads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes);
    taskCounts.set(todo.scheduledDate, (taskCounts.get(todo.scheduledDate) ?? 0) + 1);
  });
  const earliest = input.requestedAt.slice(0, 10) > weekStartDate ? input.requestedAt.slice(0, 10) : weekStartDate;
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index))
    .filter((date) => date >= earliest && date <= classDate && date <= weekEndDate);
  const destination = dates.filter((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const countLimit = constraints.maxTasksByWeekday[weekday];
    return !constraints.prohibitedWeekdays.includes(weekday)
      && (countLimit === undefined || (taskCounts.get(date) ?? 0) + 1 <= countLimit)
      && (taskLoads.get(date) ?? 0) + selected.estimatedDurationMinutes
        <= effectiveDailyStudyCapacity(date, constraints, scheduledLoads, input.maxDailyStudyMinutes ?? null);
  }).sort((left, right) => {
    const leftLoad = (taskLoads.get(left) ?? 0) + (scheduledLoads.get(left) ?? 0);
    const rightLoad = (taskLoads.get(right) ?? 0) + (scheduledLoads.get(right) ?? 0);
    return leftLoad - rightLoad || right.localeCompare(left);
  })[0];

  if (!destination) {
    return message(input, `${classDate} 수업일까지 학습 한도와 예정 일정을 지키며 이 할 일을 옮길 수 없어 기존 계획을 유지했어요.`, false, input.todos, []);
  }

  const reason = `${classDate} 수업을 준비할 수 있도록 수업일 이후에 있던 할 일을 ${destination}로 옮겼어요.`;
  const moved = withAdjustmentReason({ ...selected, scheduledDate: destination, startTime: null }, reason);
  return message(input, `${event.courseName} 수업 일정을 확인해 준비 할 일을 ${classDate} 수업일이나 그 전으로 옮겼어요.`, true,
    input.todos.map((todo) => todo.id === selected.id ? moved : todo), [selected.id]);
}

export function adjustPlanDeterministically(input: AdjustPlanInput): AdjustmentResult {
  const request = input.requestText.trim();
  const weekStartDate = input.weeklyPlan?.weekStartDate ?? input.weekStartDate ?? "2026-07-20";
  const weekEndDate = input.weeklyPlan?.weekEndDate ?? addDays(weekStartDate, 6);
  const academicEvents = input.academicEvents ?? [];
  if (/(시험일|제출일|마감일|발표일|퀴즈 날짜).*(바꿔|옮겨|미뤄)/.test(request)) {
    return message(input, "실제 시험일이나 마감일은 주간계획 수정으로 바꿀 수 없어요. 공부 계획을 어떻게 조정할지 알려주세요.", false, input.todos, []);
  }
  const selected = resolveSelectedTodo(input, request);
  const constraints = parsePlanConstraints(request);
  const hasExplicitWeekdayMinuteLimit = Object.keys(constraints.maxMinutesByWeekday).length > 0
    && /\d+(?:\.\d+)?\s*시간\s*(?:이하|이내|최대|넘기지)/.test(request);
  if (selected && /마감(?:일)?(?:에|까지).*(?:맞춰|재조정|조정|분산|재배치)|마감.*(?:맞춰|다시 조정)/.test(request)) {
    return rebalanceBeforeDeadline(input, selected, request, weekStartDate, weekEndDate, academicEvents);
  }
  if (selected && /(?:다음\s*)?수업(?:일|\s*일정|\s*시간).*(?:반영|고려|맞춰).*(?:조정|재배치)|수업(?:일|\s*일정|\s*시간).*(?:조정|재배치)/.test(request)) {
    return rebalanceBeforeClass(input, selected, request, weekStartDate, weekEndDate, academicEvents);
  }
  if (Object.keys(constraints.maxTasksByWeekday).length || hasExplicitWeekdayMinuteLimit || constraints.prohibitedWeekdays.length || constraints.maxDailyMinutes !== null) {
    const plan = { weekStartDate, weekEndDate };
    const rebalanced = rebalancePlanToConstraints(input.todos, constraints, plan, academicEvents, input.calendarEvents ?? [], input.maxDailyStudyMinutes ?? null);
    if (!rebalanced.ok) return message(input, `현재 마감과 학습량을 지키면서 요청한 조건을 적용하기 어려워요. ${rebalanced.violations.join(", ")}`, false, input.todos, []);
    const validated = validatePlanConstraints(rebalanced.todos, constraints, plan, academicEvents, input.todos, undefined, input.calendarEvents ?? [], input.maxDailyStudyMinutes ?? null, false);
    if (!validated.ok) return message(input, `요청한 조건을 검증하지 못해 계획을 변경하지 않았어요. ${validated.violations.join(", ")}`, false, input.todos, []);
    if (!rebalanced.changedTodoIds.length) return message(input, "현재 계획이 이미 요청한 조건을 만족하고 있어요.", false, input.todos, []);
    const changedIds = new Set(rebalanced.changedTodoIds);
    const todos = rebalanced.todos.map((todo) => changedIds.has(todo.id) ? withAdjustmentReason(todo, `사용자의 요청 '${request}'을 반영해 ${todo.scheduledDate}로 이동했어요.`) : todo);
    return message(input, "요청한 날짜별 개수와 학습량 조건을 반영해 주간계획을 조정했어요.", true, todos, rebalanced.changedTodoIds);
  }
  const mentionedDates = weekdays
    .map((weekday, index) => ({ position: request.indexOf(weekday), date: dateForWeekdayInPlan(weekStartDate, index) }))
    .filter(({ position }) => position >= 0)
    .sort((left, right) => left.position - right.position)
    .map(({ date }) => date);
  const targetDate = mentionedDates.at(-1) ?? null;
  const sourceDate = mentionedDates.length > 1 ? mentionedDates[0] : null;
  const explicitDate = request.match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? null;

  if (explicitDate && selected && /(옮겨|이동|배치)/.test(request)) {
    if (explicitDate < weekStartDate || explicitDate > weekEndDate || !respectsAcademicDate(selected, explicitDate, academicEvents)) return message(input, "마감일과 계획 범위를 지키면서 요청한 날짜로 이동할 수 없어요.", false, input.todos, []);
    if (explicitDate === selected.scheduledDate) return message(input, "선택한 할 일은 이미 요청한 날짜에 있어요.", false, input.todos, []);
    const moved = withAdjustmentReason({ ...selected, scheduledDate: explicitDate }, `사용자의 요청에 따라 ${explicitDate}로 이동했어요.`);
    return message(input, "요청한 날짜로 할 일을 이동했어요.", true, input.todos.map((todo) => todo.id === selected.id ? moved : todo), [selected.id]);
  }

  if (/두 날|나눠/.test(request) && selected) {
    if (selected.estimatedDurationMinutes < 60) return message(input, "이 할 일은 이미 짧아서 두 날로 나누기 어려워요. 다른 조정 방식을 알려주세요.", false, input.todos, []);
    const firstMinutes = Math.ceil(selected.estimatedDurationMinutes / 2 / 15) * 15;
    const secondMinutes = selected.estimatedDurationMinutes - firstMinutes;
    const splitConstraints = parsePlanConstraints(`${input.weeklyPlan?.generationRequest ?? ""}. ${request}`);
    const splitPlan = { weekStartDate, weekEndDate };
    const scheduledLoads = scheduledMinutesByDate(splitPlan, input.calendarEvents ?? [], academicEvents);
    const event = academicEvents.find((item) => item.id === selected.sourceExtractedItemId);
    const isClassPreparation = event?.itemType === "class-schedule"
      && (selected.todoType === "class-prep" || /(?:수업\s*)?(?:준비|예습|사전 학습)/.test(selected.title));
    const upcomingClassDate = isClassPreparation ? nextClassDate(event, input.requestedAt.slice(0, 10)) : null;
    const explicitSuccessor = input.todos.find((todo) => todo.dependsOnTodoId === selected.id && !todo.isCompleted);
    const selectedPhase = phaseOrder[schedulingPhase(selected)];
    const inferredSuccessor = input.todos
      .filter((todo) => todo.id !== selected.id && !todo.isCompleted && todo.sourceExtractedItemId === selected.sourceExtractedItemId
        && phaseOrder[schedulingPhase(todo)] > selectedPhase && todo.scheduledDate > selected.scheduledDate)
      .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || phaseOrder[schedulingPhase(left)] - phaseOrder[schedulingPhase(right)])[0];
    const successor = explicitSuccessor ?? inferredSuccessor;
    const remainingTodos = input.todos.filter((todo) => todo.id !== selected.id && !todo.isCompleted);
    const candidateDates = targetDate
      ? [targetDate]
      : Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
    if (isClassPreparation && upcomingClassDate) {
      const earliestDate = input.requestedAt.slice(0, 10) > weekStartDate ? input.requestedAt.slice(0, 10) : weekStartDate;
      const availableDates = candidateDates.filter((date) => date >= earliestDate && date < upcomingClassDate && date <= weekEndDate);
      const taskMinutes = new Map<string, number>();
      const taskCounts = new Map<string, number>();
      remainingTodos.filter(movable).forEach((todo) => {
        taskMinutes.set(todo.scheduledDate, (taskMinutes.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes);
        taskCounts.set(todo.scheduledDate, (taskCounts.get(todo.scheduledDate) ?? 0) + 1);
      });
      const canPlace = (date: string, minutes: number) => {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const countLimit = splitConstraints.maxTasksByWeekday[weekday];
        return !splitConstraints.prohibitedWeekdays.includes(weekday)
          && (countLimit === undefined || (taskCounts.get(date) ?? 0) + 1 <= countLimit)
          && (taskMinutes.get(date) ?? 0) + minutes <= effectiveDailyStudyCapacity(date, splitConstraints, scheduledLoads, input.maxDailyStudyMinutes ?? null);
      };
      const byAvailableLoad = (left: string, right: string) => ((taskMinutes.get(left) ?? 0) + (scheduledLoads.get(left) ?? 0))
        - ((taskMinutes.get(right) ?? 0) + (scheduledLoads.get(right) ?? 0)) || left.localeCompare(right);
      const firstDate = availableDates.filter((date) => canPlace(date, firstMinutes)).sort(byAvailableLoad)[0];
      if (!firstDate) return message(input, `${upcomingClassDate} 수업 전에 첫 번째 준비 작업을 배치할 시간이 부족해 기존 계획을 유지했어요.`, false, input.todos, []);
      taskMinutes.set(firstDate, (taskMinutes.get(firstDate) ?? 0) + firstMinutes);
      taskCounts.set(firstDate, (taskCounts.get(firstDate) ?? 0) + 1);
      const secondDate = availableDates.filter((date) => canPlace(date, secondMinutes))
        .sort((left, right) => Number(left === firstDate) - Number(right === firstDate) || byAvailableLoad(left, right))[0];
      if (!secondDate) return message(input, `${upcomingClassDate} 수업 전에 두 번째 준비 작업을 배치할 시간이 부족해 기존 계획을 유지했어요.`, false, input.todos, []);
      const reason = `${upcomingClassDate} 수업 전에 끝낼 수 있도록 ${firstDate}와 ${secondDate}에 나누어 배치했어요.`;
      const first = withAdjustmentReason({ ...selected, title: `${selected.title} (1/2)`, scheduledDate: firstDate, startTime: null, estimatedDurationMinutes: firstMinutes }, reason);
      const second = withAdjustmentReason({ ...selected, id: `${selected.id}-split-${input.operationId}`, title: `${selected.title} (2/2)`, scheduledDate: secondDate, startTime: null, estimatedDurationMinutes: secondMinutes, dependsOnTodoId: firstDate < secondDate ? first.id : selected.dependsOnTodoId ?? null }, reason);
      const changedTodoIds = [first.id, second.id];
      const todos = input.todos.flatMap((todo) => {
        if (todo.id === selected.id) return [first, second];
        if (todo.dependsOnTodoId === selected.id || todo.id === successor?.id) {
          changedTodoIds.push(todo.id);
          return [{ ...todo, dependsOnTodoId: second.id }];
        }
        return [todo];
      });
      return message(input, `${event.courseName} 수업 전에 끝낼 수 있도록 준비 할 일을 두 부분으로 나누어 조정했어요.`, true, todos, changedTodoIds);
    }
    const nextDate = candidateDates.filter((date) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const countLimit = splitConstraints.maxTasksByWeekday[weekday];
      const count = remainingTodos.filter((todo) => todo.scheduledDate === date).length;
      const minutes = remainingTodos.filter((todo) => todo.scheduledDate === date).reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0);
      return date > selected.scheduledDate && date <= weekEndDate
        && (!event?.date || date < event.date)
        && (!successor || date < successor.scheduledDate)
        && !splitConstraints.prohibitedWeekdays.includes(weekday)
        && (countLimit === undefined || count + 1 <= countLimit)
        && minutes + secondMinutes <= effectiveDailyStudyCapacity(date, splitConstraints, scheduledLoads, input.maxDailyStudyMinutes ?? null);
    }).sort((left, right) => {
      const load = (date: string) => remainingTodos.filter((todo) => todo.scheduledDate === date).reduce((sum, todo) => sum + todo.estimatedDurationMinutes, scheduledLoads.get(date) ?? 0);
      return load(left) - load(right) || left.localeCompare(right);
    })[0];
    if (!nextDate) return message(input, "마감, 날짜별 학습량과 기존 요일 조건을 지키면서 두 날로 나눌 수 없어요. 다른 날짜를 알려주세요.", false, input.todos, []);
    const reason = `사용자의 요청에 따라 ${selected.scheduledDate}와 ${nextDate} 두 날로 나누어 배치했어요.`;
    const first = withAdjustmentReason({ ...selected, estimatedDurationMinutes: firstMinutes }, reason);
    const second = withAdjustmentReason({ ...selected, id: `${selected.id}-split-${input.operationId}`, scheduledDate: nextDate, startTime: null, estimatedDurationMinutes: secondMinutes, dependsOnTodoId: first.id }, reason);
    const changedTodoIds = [first.id, second.id];
    const todos = input.todos.flatMap((todo) => {
      if (todo.id === selected.id) return [first, second];
      if (todo.dependsOnTodoId === selected.id || todo.id === successor?.id) {
        changedTodoIds.push(todo.id);
        return [{ ...todo, dependsOnTodoId: second.id }];
      }
      return [todo];
    });
    return message(input, "요청한 할 일을 기존 요일 조건과 학습량을 지키는 두 날로 나누어 조정했어요.", true, todos, changedTodoIds);
  }

  if (/(시간.*늘려|조금 더|공부시간.*늘)/.test(request) && selected) {
    const increased = withAdjustmentReason({ ...selected, estimatedDurationMinutes: Math.ceil(selected.estimatedDurationMinutes * 1.25 / 15) * 15 }, "사용자의 요청에 따라 이 할 일의 학습 시간을 늘렸어요.");
    return message(input, "선택한 할 일의 학습 시간을 늘렸어요.", true, input.todos.map((todo) => todo.id === selected.id ? increased : todo), [selected.id]);
  }

  if (/(시간.*줄여|조금 덜|공부시간.*줄)/.test(request) && selected) {
    const decreasedMinutes = Math.max(15, Math.floor(selected.estimatedDurationMinutes * 0.75 / 15) * 15);
    if (decreasedMinutes === selected.estimatedDurationMinutes) return message(input, "이 할 일은 이미 최소 조정 단위라 더 줄이지 않았어요.", false, input.todos, []);
    const decreased = withAdjustmentReason({ ...selected, estimatedDurationMinutes: decreasedMinutes }, "사용자의 요청에 따라 이 할 일의 학습 시간을 줄였어요.");
    return message(input, "선택한 할 일의 학습 시간을 줄였어요.", true, input.todos.map((todo) => todo.id === selected.id ? decreased : todo), [selected.id]);
  }

  if (/(우선|먼저)/.test(request) && selected) {
    if (selected.priority === "high") return message(input, "선택한 할 일은 이미 높은 우선순위예요.", false, input.todos, []);
    const prioritized = withAdjustmentReason({ ...selected, priority: "high" }, "사용자의 요청에 따라 이 할 일을 우선 배치 대상으로 표시했어요.");
    return message(input, "선택한 할 일의 우선순위를 높였어요.", true, input.todos.map((todo) => todo.id === selected.id ? prioritized : todo), [selected.id]);
  }

  const maxHours = request.match(/(?:하루|매일).*?(\d+)시간.*?(?:이하|넘지|최대|줄)/);
  if (maxHours) {
    const maximum = Number(maxHours[1]) * 60;
    const loads = new Map<string, number>();
    input.todos.filter(movable).forEach((todo) => loads.set(todo.scheduledDate, (loads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes));
    const overloaded = [...loads.entries()].find(([, minutes]) => minutes > maximum);
    if (!overloaded) return message(input, `현재 계획은 이미 하루 ${maximum / 60}시간 이하예요.`, false, input.todos, []);
    const candidate = input.todos.filter((todo) => movable(todo) && todo.scheduledDate === overloaded[0]).sort((a, b) => b.estimatedDurationMinutes - a.estimatedDurationMinutes)[0];
    const destination = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)).find((date) => date !== overloaded[0] && (loads.get(date) ?? 0) + candidate.estimatedDurationMinutes <= maximum && respectsAcademicDate(candidate, date, academicEvents));
    if (!destination) return message(input, "마감과 현재 학습량을 지키면서 요청한 일일 시간 제한을 적용하기 어려워요.", false, input.todos, []);
    const moved = withAdjustmentReason({ ...candidate, scheduledDate: destination }, `사용자가 요청한 하루 ${maximum / 60}시간 제한을 맞추기 위해 ${destination}로 이동했어요.`);
    return message(input, "하루 학습량 제한에 맞게 계획을 조정했어요.", true, input.todos.map((todo) => todo.id === candidate.id ? moved : todo), [candidate.id]);
  }

  if (targetDate) {
    const avoidWholeDay = /(전혀|공부하기 싫|쉬고 싶|하지 않)/.test(request);
    const reduceDay = /(줄여|가볍게)/.test(request) && !selected && !sourceDate;
    const candidates = avoidWholeDay
      ? input.todos.filter((todo) => movable(todo) && todo.scheduledDate === targetDate)
      : reduceDay
        ? input.todos.filter((todo) => movable(todo) && todo.scheduledDate === targetDate).sort((a, b) => b.estimatedDurationMinutes - a.estimatedDurationMinutes).slice(0, 1)
      : sourceDate
        ? input.todos.filter((todo) => movable(todo) && todo.scheduledDate === sourceDate)
        : selected ? [selected] : input.todos.filter((todo) => movable(todo) && todo.scheduledDate !== targetDate).slice(0, 1);
    if (!candidates.length) return message(input, "옮길 수 있는 해당 날짜의 미완료 할 일을 찾지 못했어요. 다른 방식으로 수정사항을 입력해주세요.", false, input.todos, []);
    const destination = avoidWholeDay
      ? Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)).find((date) => date !== targetDate && candidates.every((todo) => respectsAcademicDate(todo, date, academicEvents)))
      : reduceDay ? addDays(targetDate, targetDate === weekEndDate ? -1 : 1)
      : targetDate;
    if (!destination || candidates.some((todo) => !respectsAcademicDate(todo, destination, academicEvents))) return message(input, "마감일을 지키면서 요청한 날짜로 이동할 수 없어요. 다른 날짜를 알려주세요.", false, input.todos, []);
    const ids = new Set(candidates.map((todo) => todo.id));
    const reason = avoidWholeDay ? `사용자의 요청에 따라 ${targetDate}의 학습을 비우고 ${destination}로 이동했어요.` : `사용자의 요청에 따라 ${destination}로 이동했어요.`;
    return message(input, "요청한 날짜 조건을 반영해 주간계획을 조정했어요.", true, input.todos.map((todo) => ids.has(todo.id) ? withAdjustmentReason({ ...todo, scheduledDate: destination }, reason) : todo), [...ids]);
  }

  return message(input, "수정 요청사항을 주간계획 수정에 반영할 수 없습니다. 다른 방식으로 수정사항을 입력해주세요.", false, input.todos, []);
}
