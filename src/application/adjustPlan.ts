import type { AdjustmentResult, ExtractedItem, OperationId, Todo, WeeklyPlan } from "../domain/types";

export interface AdjustPlanInput {
  operationId: OperationId;
  requestText: string;
  requestedAt: string;
  weeklyPlan?: WeeklyPlan;
  weekStartDate?: string;
  todos: Todo[];
  academicEvents?: ExtractedItem[];
  selectedTodoId?: string | null;
}

const weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function movable(todo: Todo) {
  return !todo.isCompleted;
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

export function adjustMockPlan(input: AdjustPlanInput): AdjustmentResult {
  const request = input.requestText.trim();
  const weekStartDate = input.weeklyPlan?.weekStartDate ?? input.weekStartDate ?? "2026-07-20";
  const weekEndDate = input.weeklyPlan?.weekEndDate ?? addDays(weekStartDate, 6);
  const academicEvents = input.academicEvents ?? [];
  if (/(시험일|제출일|마감일|발표일|퀴즈 날짜).*(바꿔|옮겨|미뤄)/.test(request)) {
    return message(input, "실제 시험일이나 마감일은 주간계획 수정으로 바꿀 수 없어요. 공부 계획을 어떻게 조정할지 알려주세요.", false, input.todos, []);
  }
  const selected = input.todos.find((todo) => todo.id === input.selectedTodoId && movable(todo));
  const mentionedDates = weekdays
    .map((weekday, index) => ({ position: request.indexOf(weekday), date: addDays(weekStartDate, index) }))
    .filter(({ position }) => position >= 0)
    .sort((left, right) => left.position - right.position)
    .map(({ date }) => date);
  const targetDate = mentionedDates.at(-1) ?? null;
  const sourceDate = mentionedDates.length > 1 ? mentionedDates[0] : null;

  if (/두 날|나눠/.test(request) && selected) {
    if (selected.estimatedDurationMinutes < 60) return message(input, "이 할 일은 이미 짧아서 두 날로 나누기 어려워요. 다른 조정 방식을 알려주세요.", false, input.todos, []);
    const firstMinutes = Math.ceil(selected.estimatedDurationMinutes / 2 / 15) * 15;
    const secondMinutes = selected.estimatedDurationMinutes - firstMinutes;
    const nextDate = targetDate ?? addDays(selected.scheduledDate, 1);
    if (nextDate > weekEndDate || !respectsAcademicDate(selected, nextDate, academicEvents)) return message(input, "마감과 계획 범위 안에서 두 날로 나눌 수 없어요. 다른 날짜를 알려주세요.", false, input.todos, []);
    const reason = `사용자의 요청에 따라 ${selected.scheduledDate}와 ${nextDate} 두 날로 나누어 배치했어요.`;
    const first = withAdjustmentReason({ ...selected, estimatedDurationMinutes: firstMinutes }, reason);
    const second = withAdjustmentReason({ ...selected, id: `${selected.id}-split-${input.operationId}`, scheduledDate: nextDate, estimatedDurationMinutes: secondMinutes }, reason);
    const todos = input.todos.flatMap((todo) => todo.id === selected.id ? [first, second] : [todo]);
    return message(input, "요청한 할 일을 두 날로 나누어 조정했어요.", true, todos, [first.id, second.id]);
  }

  if (/(시간.*늘려|조금 더|공부시간.*늘)/.test(request) && selected) {
    const increased = withAdjustmentReason({ ...selected, estimatedDurationMinutes: Math.ceil(selected.estimatedDurationMinutes * 1.25 / 15) * 15 }, "사용자의 요청에 따라 이 할 일의 학습 시간을 늘렸어요.");
    return message(input, "선택한 할 일의 학습 시간을 늘렸어요.", true, input.todos.map((todo) => todo.id === selected.id ? increased : todo), [selected.id]);
  }

  const maxHours = request.match(/(?:하루|매일).*?(\d+)시간.*?(?:이하|넘지|최대|줄)/);
  if (maxHours) {
    const maximum = Number(maxHours[1]) * 60;
    const loads = new Map<string, number>();
    input.todos.filter(movable).forEach((todo) => loads.set(todo.scheduledDate, (loads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes));
    const overloaded = [...loads.entries()].find(([, minutes]) => minutes > maximum);
    if (!overloaded) return message(input, `현재 계획은 이미 하루 ${maximum / 60}시간 이하예요.`, false, input.todos, []);
    const candidate = input.todos.filter((todo) => movable(todo) && todo.scheduledDate === overloaded[0]).sort((a, b) => b.estimatedDurationMinutes - a.estimatedDurationMinutes)[0];
    const destination = weekdays.map((_, index) => addDays(weekStartDate, index)).find((date) => date !== overloaded[0] && (loads.get(date) ?? 0) + candidate.estimatedDurationMinutes <= maximum && respectsAcademicDate(candidate, date, academicEvents));
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
      ? weekdays.map((_, index) => addDays(weekStartDate, index)).find((date) => date !== targetDate && candidates.every((todo) => respectsAcademicDate(todo, date, academicEvents)))
      : reduceDay ? addDays(targetDate, targetDate === weekEndDate ? -1 : 1)
      : targetDate;
    if (!destination || candidates.some((todo) => !respectsAcademicDate(todo, destination, academicEvents))) return message(input, "마감일을 지키면서 요청한 날짜로 이동할 수 없어요. 다른 날짜를 알려주세요.", false, input.todos, []);
    const ids = new Set(candidates.map((todo) => todo.id));
    const reason = avoidWholeDay ? `사용자의 요청에 따라 ${targetDate}의 학습을 비우고 ${destination}로 이동했어요.` : `사용자의 요청에 따라 ${destination}로 이동했어요.`;
    return message(input, "요청한 날짜 조건을 반영해 주간계획을 조정했어요.", true, input.todos.map((todo) => ids.has(todo.id) ? withAdjustmentReason({ ...todo, scheduledDate: destination }, reason) : todo), [...ids]);
  }

  return message(input, "수정 요청사항을 주간계획 수정에 반영할 수 없습니다. 다른 방식으로 수정사항을 입력해주세요.", false, input.todos, []);
}
