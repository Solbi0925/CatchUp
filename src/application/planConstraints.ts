import type { CalendarEvent, ExtractedItem, Todo, WeeklyPlan } from "../domain/types";

const weekdays = [
  ["일요일", 0], ["월요일", 1], ["화요일", 2], ["수요일", 3],
  ["목요일", 4], ["금요일", 5], ["토요일", 6],
] as const;

export interface PlanConstraints {
  maxTasksByWeekday: Partial<Record<number, number>>;
  maxMinutesByWeekday: Partial<Record<number, number>>;
  prohibitedWeekdays: number[];
  maxDailyMinutes: number | null;
  preferredWeekdays: number[];
}
export interface PlanValidationResult { ok: boolean; violations: string[]; }
export interface PlanRebalanceResult { ok: boolean; todos: Todo[]; changedTodoIds: string[]; violations: string[]; }

// 16시간의 깨어 있는 시간에서 식사·이동·휴식 4시간을 제외한 유연 시간대다.
// 예정 일정은 학습시간 자체에 더하지 않고 이 시간대에서만 차감한다.
export const DAILY_FLEXIBLE_WINDOW_MINUTES = 12 * 60;

function dayOf(date: string) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function addDays(isoDate: string, amount: number) { const date = new Date(`${isoDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function weekdayLabel(value: number) { return weekdays.find(([, weekday]) => weekday === value)?.[0] ?? "해당 요일"; }
function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute);
}
function timeToMinutes(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function overlaps(start: number, end: number, otherStart: number, otherEnd: number) { return start < otherEnd && otherStart < end; }
function participatesInPlanning(todo: Todo) { return todo.planningParticipation !== "calendar-only"; }

export function parsePlanConstraints(requestText: string): PlanConstraints {
  const text = requestText.normalize("NFC").replace(/\s+/g, " ");
  const maxTasksByWeekday: Partial<Record<number, number>> = {};
  const maxMinutesByWeekday: Partial<Record<number, number>> = {};
  for (const clause of text.split(/[.?!\n]/).filter(Boolean)) {
    const count = clause.match(/(\d+)\s*개\s*(?:이하|이내|최대|넘기지|말게)/);
    if (count) for (const [label, weekday] of weekdays) if (clause.includes(label)) maxTasksByWeekday[weekday] = Number(count[1]);
    const hours = clause.match(/(\d+(?:\.\d+)?)\s*시간\s*(?:이하|이내|최대|넘기지)/);
    if (hours) {
      for (const [label, weekday] of weekdays) if (clause.includes(label)) maxMinutesByWeekday[weekday] = Number(hours[1]) * 60;
    } else if (/(?:적게|가볍게|줄여)/.test(clause)) {
      for (const [label, weekday] of weekdays) if (clause.includes(label)) maxMinutesByWeekday[weekday] = Math.min(maxMinutesByWeekday[weekday] ?? 60, 60);
    }
  }
  const prohibitedWeekdays = weekdays.filter(([label]) => new RegExp(`${label}[^.?!\\n]*(?:하지 마|하지 않|공부하지 마|공부하지 않|쉬고 싶|비워|배치하지 마)`).test(text)).map(([, weekday]) => weekday);
  const preferredWeekdays = weekdays.filter(([label, weekday]) => !prohibitedWeekdays.includes(weekday) && new RegExp(`${label}[^.?!\\n]*(?:몰아|집중|많이)`).test(text)).map(([, weekday]) => weekday);
  const maxHours = text.match(/(?:하루|매일|각 요일)[^.?!\n]*?(\d+(?:\.\d+)?)\s*시간[^.?!\n]*?(?:이하|이내|최대|넘기지)/);
  return { maxTasksByWeekday, maxMinutesByWeekday, prohibitedWeekdays, maxDailyMinutes: maxHours ? Number(maxHours[1]) * 60 : null, preferredWeekdays };
}

export function learningMinuteLimit(constraints: PlanConstraints, weekday: number) {
  const limits = [constraints.maxDailyMinutes, constraints.maxMinutesByWeekday[weekday]].filter((value): value is number => value !== null && value !== undefined);
  return limits.length ? Math.min(...limits) : null;
}

/** 실제 시각을 점유하는 일정. 시간 미정 학업 이벤트는 0분, 명시적 종일 일정은 하루를 점유한다. */
export function scheduledMinutesByDate(plan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate">, calendarEvents: CalendarEvent[], academicEvents: ExtractedItem[]) {
  const loads = new Map<string, number>();
  const add = (date: string, minutes: number) => {
    if (date >= plan.weekStartDate && date <= plan.weekEndDate && minutes > 0) loads.set(date, (loads.get(date) ?? 0) + minutes);
  };
  for (const event of calendarEvents) add(event.date, event.isAllDay ? DAILY_FLEXIBLE_WINDOW_MINUTES : minutesBetween(event.startTime, event.endTime));
  for (const item of academicEvents) {
    if (item.itemType === "class-schedule") {
      for (const meeting of item.classMeetingTimes) for (let index = 0; index < 7; index += 1) {
        const date = addDays(plan.weekStartDate, index);
        if (dayOf(date) === meeting.weekday) add(date, minutesBetween(meeting.startTime, meeting.endTime));
      }
    } else if (item.confirmationStatus === "confirmed" && item.date) {
      if (item.isAllDay) add(item.date, DAILY_FLEXIBLE_WINDOW_MINUTES);
      else if (item.time) add(item.date, 60);
    }
  }
  return loads;
}

export function effectiveDailyStudyCapacity(
  date: string,
  constraints: PlanConstraints,
  scheduledLoads: Map<string, number>,
  maxDailyStudyMinutes: number | null | undefined,
) {
  const weekday = dayOf(date);
  const requestedLimit = learningMinuteLimit(constraints, weekday);
  const studyLimit = Math.min(
    maxDailyStudyMinutes ?? Number.POSITIVE_INFINITY,
    requestedLimit ?? Number.POSITIVE_INFINITY,
  );
  const realisticAvailable = Math.max(0, DAILY_FLEXIBLE_WINDOW_MINUTES - (scheduledLoads.get(date) ?? 0));
  return Math.min(studyLimit, realisticAvailable);
}

export function taskMinutesByDate(todos: Todo[]) {
  const loads = new Map<string, number>();
  for (const todo of todos) if (!todo.isCompleted && participatesInPlanning(todo)) loads.set(todo.scheduledDate, (loads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes);
  return loads;
}

export function validatePlanConstraints(
  todos: Todo[], constraints: PlanConstraints, plan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate">,
  academicEvents: ExtractedItem[], beforeTodos?: Todo[], preserveUnrelatedTo?: Set<string>, calendarEvents: CalendarEvent[] = [],
  maxDailyStudyMinutes: number | null = null, enforceWorkloadBalance = true,
): PlanValidationResult {
  const violations: string[] = [];
  const active = todos.filter((todo) => !todo.isCompleted && participatesInPlanning(todo));
  const taskLoads = taskMinutesByDate(active);
  const scheduledLoads = scheduledMinutesByDate(plan, calendarEvents, academicEvents);
  const totalLoad = (date: string) => (taskLoads.get(date) ?? 0) + (scheduledLoads.get(date) ?? 0);
  for (const [key, maximum] of Object.entries(constraints.maxTasksByWeekday)) {
    const weekday = Number(key); const count = active.filter((todo) => dayOf(todo.scheduledDate) === weekday).length;
    if (maximum !== undefined && count > maximum) violations.push(`${weekdayLabel(weekday)} 할 일 ${count}개(최대 ${maximum}개)`);
  }
  for (const weekday of constraints.prohibitedWeekdays) if (active.some((todo) => dayOf(todo.scheduledDate) === weekday)) violations.push(`${weekdayLabel(weekday)} 학습 금지 조건`);
  for (const [date, minutes] of taskLoads) {
    const limit = effectiveDailyStudyCapacity(date, constraints, scheduledLoads, maxDailyStudyMinutes);
    if (minutes > limit) violations.push(`${date} 학습량 ${minutes}분(실질 최대 ${limit}분)`);
  }
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  for (const todo of todos) {
    if (!participatesInPlanning(todo)) continue;
    if (todo.scheduledDate < plan.weekStartDate || todo.scheduledDate > plan.weekEndDate) violations.push(`${todo.title}: 계획 범위 밖`);
    const event = academicEvents.find((item) => item.id === todo.sourceExtractedItemId);
    if (event?.date && todo.scheduledDate >= event.date) violations.push(`${todo.title}: 마감·시험일 이전이 아님`);
    if (todo.dependsOnTodoId) {
      const predecessor = byId.get(todo.dependsOnTodoId);
      if (!predecessor || predecessor.sourceExtractedItemId !== todo.sourceExtractedItemId || predecessor.scheduledDate >= todo.scheduledDate) violations.push(`${todo.title}: 선행 Task보다 먼저 또는 같은 날에 배치`);
    }
    if (!todo.isCompleted && todo.startTime) {
      const start = timeToMinutes(todo.startTime); const end = start + todo.estimatedDurationMinutes;
      const calendarCollision = calendarEvents.some((event) => event.date === todo.scheduledDate && (event.isAllDay || Boolean(event.startTime && event.endTime && overlaps(start, end, timeToMinutes(event.startTime), timeToMinutes(event.endTime)))));
      const classCollision = academicEvents.filter((item) => item.itemType === "class-schedule" && item.confirmationStatus === "confirmed").some((item) => item.classMeetingTimes.some((meeting) => meeting.weekday === dayOf(todo.scheduledDate) && overlaps(start, end, timeToMinutes(meeting.startTime), timeToMinutes(meeting.endTime))));
      if (calendarCollision || classCollision) violations.push(`${todo.title}: 개인 일정 또는 수업 시간과 충돌`);
    }
  }
  if (beforeTodos) {
    const after = new Map(todos.map((todo) => [todo.id, todo]));
    for (const previous of beforeTodos.filter((todo) => todo.isCompleted)) if (JSON.stringify(after.get(previous.id)) !== JSON.stringify(previous)) violations.push(`완료된 할 일 변경: ${previous.title}`);
    if (preserveUnrelatedTo) for (const previous of beforeTodos.filter((todo) => !todo.isCompleted && !preserveUnrelatedTo.has(todo.sourceExtractedItemId))) if (JSON.stringify(after.get(previous.id)) !== JSON.stringify(previous)) violations.push(`관련 없는 할 일 변경: ${previous.title}`);
  }
  for (const todo of (!enforceWorkloadBalance || preserveUnrelatedTo ? [] : active.filter((item) => item.taskPhase))) {
    if (constraints.preferredWeekdays.includes(dayOf(todo.scheduledDate))) continue;
    const event = academicEvents.find((item) => item.id === todo.sourceExtractedItemId);
    const predecessor = todo.dependsOnTodoId ? byId.get(todo.dependsOnTodoId) : undefined;
    const successor = active.find((item) => item.dependsOnTodoId === todo.id);
    const candidates = Array.from({ length: 7 }, (_, index) => addDays(plan.weekStartDate, index)).filter((date) => {
      const weekday = dayOf(date); const limit = constraints.maxTasksByWeekday[weekday];
      return date !== todo.scheduledDate && (!event?.date || date < event.date) && (!predecessor || date > predecessor.scheduledDate) && (!successor || date < successor.scheduledDate)
        && !constraints.prohibitedWeekdays.includes(weekday)
        && (limit === undefined || active.filter((item) => item.scheduledDate === date).length < limit)
        && (taskLoads.get(date) ?? 0) + todo.estimatedDurationMinutes <= effectiveDailyStudyCapacity(date, constraints, scheduledLoads, maxDailyStudyMinutes);
    });
    if (candidates.some((date) => totalLoad(date) + todo.estimatedDurationMinutes < totalLoad(todo.scheduledDate))) violations.push(`${todo.title}: 더 여유 있는 유효 날짜가 있는데 과부하 날짜에 배치`);
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

export function rebalancePlanToConstraints(
  todos: Todo[], constraints: PlanConstraints, plan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate">,
  academicEvents: ExtractedItem[], calendarEvents: CalendarEvent[] = [],
  maxDailyStudyMinutes: number | null = null,
): PlanRebalanceResult {
  let next = todos.map((todo) => ({ ...todo })); const changed = new Set<string>();
  const dates = Array.from({ length: 7 }, (_, index) => addDays(plan.weekStartDate, index));
  const scheduledLoads = scheduledMinutesByDate(plan, calendarEvents, academicEvents);
  const countOn = (date: string) => next.filter((todo) => !todo.isCompleted && participatesInPlanning(todo) && todo.scheduledDate === date).length;
  const taskLoadOn = (date: string) => next.filter((todo) => !todo.isCompleted && participatesInPlanning(todo) && todo.scheduledDate === date).reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0);
  const totalLoadOn = (date: string) => taskLoadOn(date) + (scheduledLoads.get(date) ?? 0);
  const allowed = (todo: Todo, date: string) => {
    const weekday = dayOf(date); const limit = constraints.maxTasksByWeekday[weekday];
    const event = academicEvents.find((item) => item.id === todo.sourceExtractedItemId);
    const predecessor = todo.dependsOnTodoId ? next.find((item) => item.id === todo.dependsOnTodoId) : undefined;
    const successor = next.find((item) => item.dependsOnTodoId === todo.id);
    return !constraints.prohibitedWeekdays.includes(weekday) && (limit === undefined || countOn(date) < limit)
      && taskLoadOn(date) + todo.estimatedDurationMinutes <= effectiveDailyStudyCapacity(date, constraints, scheduledLoads, maxDailyStudyMinutes)
      && (!event?.date || date < event.date) && (!predecessor || date > predecessor.scheduledDate) && (!successor || date < successor.scheduledDate);
  };
  for (const date of dates) {
    const weekday = dayOf(date); const maximum = constraints.maxTasksByWeekday[weekday];
    const minuteLimit = effectiveDailyStudyCapacity(date, constraints, scheduledLoads, maxDailyStudyMinutes);
    const violatesDate = () => constraints.prohibitedWeekdays.includes(weekday)
      ? countOn(date) > 0
      : (maximum !== undefined && countOn(date) > maximum) || taskLoadOn(date) > minuteLimit;
    const attempted = new Set<string>();
    while (violatesDate()) {
      const priorityRank = { low: 0, medium: 1, high: 2 } as const;
      const candidates = next
        .filter((todo) => !todo.isCompleted && participatesInPlanning(todo) && todo.scheduledDate === date && !attempted.has(todo.id))
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.estimatedDurationMinutes - a.estimatedDurationMinutes || a.id.localeCompare(b.id));
      let moved = false;
      for (const todo of candidates) {
        attempted.add(todo.id);
        const destination = dates.filter((candidate) => candidate !== date && allowed(todo, candidate)).sort((a, b) => Number(!constraints.preferredWeekdays.includes(dayOf(a))) - Number(!constraints.preferredWeekdays.includes(dayOf(b))) || totalLoadOn(a) - totalLoadOn(b) || a.localeCompare(b))[0];
        if (!destination) continue;
        next = next.map((candidate) => candidate.id === todo.id ? { ...candidate, scheduledDate: destination, recommendationReason: `사용자의 명시적 제약과 날짜별 부담량을 반영해 ${destination}로 이동했어요.` } : candidate); changed.add(todo.id);
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }
  const validation = validatePlanConstraints(next, constraints, plan, academicEvents, undefined, undefined, calendarEvents, maxDailyStudyMinutes, false);
  return { ok: validation.ok, todos: validation.ok ? next : todos, changedTodoIds: validation.ok ? [...changed] : [], violations: validation.violations };
}
