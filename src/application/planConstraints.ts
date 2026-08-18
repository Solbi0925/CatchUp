import type { ExtractedItem, Todo, WeeklyPlan } from "../domain/types";

const weekdays = [
  ["일요일", 0], ["월요일", 1], ["화요일", 2], ["수요일", 3],
  ["목요일", 4], ["금요일", 5], ["토요일", 6],
] as const;

export interface PlanConstraints {
  maxTasksByWeekday: Partial<Record<number, number>>;
  prohibitedWeekdays: number[];
  maxDailyMinutes: number | null;
}
export interface PlanValidationResult { ok: boolean; violations: string[]; }
export interface PlanRebalanceResult { ok: boolean; todos: Todo[]; changedTodoIds: string[]; violations: string[]; }

function dayOf(date: string) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function addDays(isoDate: string, amount: number) { const date = new Date(`${isoDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function weekdayLabel(value: number) { return weekdays.find(([, weekday]) => weekday === value)?.[0] ?? "해당 요일"; }

export function parsePlanConstraints(requestText: string): PlanConstraints {
  // macOS workspaces can contain decomposed Hangul in source files. Normalize
  // runtime input to the same representation before matching Korean phrases.
  const text = requestText.normalize("NFD").replace(/\s+/g, " ");
  const maxTasksByWeekday: Partial<Record<number, number>> = {};
  for (const clause of text.split(/[.?!\n]/).filter(Boolean)) {
    const count = clause.match(/(\d+)\s*개\s*(?:이하|이내|최대|넘기지|말게)/);
    if (count) for (const [label, weekday] of weekdays) if (clause.includes(label)) maxTasksByWeekday[weekday] = Number(count[1]);
  }
  const prohibitedWeekdays = weekdays.filter(([label]) => new RegExp(`${label}[^.?!\\n]*(?:하지 마|공부하지 마|쉬고 싶|비워|배치하지 마)`).test(text)).map(([, weekday]) => weekday);
  const maxHours = text.match(/(?:하루|매일)[^.?!\n]*?(\d+(?:\.\d+)?)\s*시간[^.?!\n]*?(?:이하|이내|최대|넘기지)/);
  return { maxTasksByWeekday, prohibitedWeekdays, maxDailyMinutes: maxHours ? Number(maxHours[1]) * 60 : null };
}

export function validatePlanConstraints(todos: Todo[], constraints: PlanConstraints, plan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate">, academicEvents: ExtractedItem[], beforeTodos?: Todo[], preserveUnrelatedTo?: Set<string>): PlanValidationResult {
  const violations: string[] = []; const active = todos.filter((todo) => !todo.isCompleted);
  for (const [key, maximum] of Object.entries(constraints.maxTasksByWeekday)) {
    const weekday = Number(key); const count = active.filter((todo) => dayOf(todo.scheduledDate) === weekday).length;
    if (maximum !== undefined && count > maximum) violations.push(`${weekdayLabel(weekday)} 할 일 ${count}개(최대 ${maximum}개)`);
  }
  for (const weekday of constraints.prohibitedWeekdays) if (active.some((todo) => dayOf(todo.scheduledDate) === weekday)) violations.push(`${weekdayLabel(weekday)} 학습 금지 조건`);
  if (constraints.maxDailyMinutes !== null) {
    const loads = new Map<string, number>(); active.forEach((todo) => loads.set(todo.scheduledDate, (loads.get(todo.scheduledDate) ?? 0) + todo.estimatedDurationMinutes));
    for (const [date, minutes] of loads) if (minutes > constraints.maxDailyMinutes) violations.push(`${date} 학습ၟ량 ${minutes}분(최대 ${constraints.maxDailyMinutes}분)`);
  }
  for (const todo of todos) {
    if (todo.scheduledDate < plan.weekStartDate || todo.scheduledDate > plan.weekEndDate) violations.push(`${todo.title}: 계획 범위 밖`);
    const event = academicEvents.find((item) => item.id === todo.sourceExtractedItemId);
    if (event?.date && todo.scheduledDate > event.date) violations.push(`${todo.title}: 마감일 이후로 배치`);
  }
  if (beforeTodos) {
    const after = new Map(todos.map((todo) => [todo.id, todo]));
    for (const previous of beforeTodos.filter((todo) => todo.isCompleted)) if (JSON.stringify(after.get(previous.id)) !== JSON.stringify(previous)) violations.push(`완료된 할 일 변경: ${previous.title}`);
    if (preserveUnrelatedTo) for (const previous of beforeTodos.filter((todo) => !todo.isCompleted && !preserveUnrelatedTo.has(todo.sourceExtractedItemId))) if (JSON.stringify(after.get(previous.id)) !== JSON.stringify(previous)) violations.push(`관련 없는 할 일 변경: ${previous.title}`);
  }
  return { ok: violations.length === 0, violations };
}

export function rebalancePlanToConstraints(todos: Todo[], constraints: PlanConstraints, plan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate">, academicEvents: ExtractedItem[]): PlanRebalanceResult {
  let next = todos.map((todo) => ({ ...todo })); const changed = new Set<string>(); const dates = Array.from({ length: 7 }, (_, index) => addDays(plan.weekStartDate, index));
  const countOn = (date: string) => next.filter((todo) => !todo.isCompleted && todo.scheduledDate === date).length;
  const loadOn = (date: string) => next.filter((todo) => !todo.isCompleted && todo.scheduledDate === date).reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0);
  const allowed = (todo: Todo, date: string) => { const weekday = dayOf(date); const limit = constraints.maxTasksByWeekday[weekday]; const event = academicEvents.find((item) => item.id === todo.sourceExtractedItemId); return !constraints.prohibitedWeekdays.includes(weekday) && (limit === undefined || countOn(date) < limit) && (constraints.maxDailyMinutes === null || loadOn(date) + todo.estimatedDurationMinutes <= constraints.maxDailyMinutes) && (!event?.date || date <= event.date); };
  for (const date of dates) {
    const weekday = dayOf(date); const maximum = constraints.maxTasksByWeekday[weekday]; const candidates = next.filter((todo) => !todo.isCompleted && todo.scheduledDate === date).sort((a, b) => a.priority.localeCompare(b.priority));
    const excess = constraints.prohibitedWeekdays.includes(weekday) ? candidates.length : maximum === undefined ? 0 : Math.max(0, candidates.length - maximum);
    for (const todo of candidates.slice(0, excess)) {
      const destination = dates.filter((candidate) => candidate !== date && allowed(todo, candidate)).sort((a, b) => countOn(a) - countOn(b) || loadOn(a) - loadOn(b))[0];
      if (!destination) continue;
      next = next.map((candidate) => candidate.id === todo.id ? { ...candidate, scheduledDate: destination, recommendationReason: `사용자의 명시적 제약에 맞춰 ${destination}로 이동해써요.` } : candidate); changed.add(todo.id);
    }
  }
  const validation = validatePlanConstraints(next, constraints, plan, academicEvents);
  return { ok: validation.ok, todos: validation.ok ? next : todos, changedTodoIds: validation.ok ? [...changed] : [], violations: validation.violations };
}
