import { getPlanWeekWindow } from "../domain/policies";
import type {
  AiMateMessage, CalendarEvent, ExtractedItem, GeneratePlanCommand, InterpretedPlanConstraints,
  PlanDiff, Todo, WeeklyPlan,
} from "../domain/types";
import { effectiveDailyStudyCapacity, parsePlanConstraints, scheduledMinutesByDate, taskMinutesByDate } from "./planConstraints";

export type AiPlanningMode = "generate" | "update" | "adjust";
export type AiPlanViolationCode =
  | "SCHEMA_MISMATCH" | "UNKNOWN_ACADEMIC_EVENT" | "UNCONFIRMED_ACADEMIC_EVENT"
  | "TASK_OUTSIDE_PLAN" | "TASK_AFTER_DEADLINE" | "INVALID_DATE" | "INVALID_TIME"
  | "INVALID_DURATION" | "DUPLICATE_TASK" | "INVALID_DEPENDENCY" | "SCHEDULE_TIME_COLLISION"
  | "PROHIBITED_WEEKDAY" | "DAILY_MINUTES_EXCEEDED" | "WEEKDAY_TASK_LIMIT_EXCEEDED"
  | "REQUEST_CONSTRAINT_MISMATCH" | "UNRELATED_TASK_CHANGED" | "MODEL_EXECUTION_FAILED"
  | "MODEL_TIMEOUT" | "JSON_PARSE_FAILED" | "REGENERATION_FAILED"
  | "REQUIRED_EVENT_TASK_MISSING" | "INSUFFICIENT_EVENT_WORK";

export interface AiPlanViolation {
  code: AiPlanViolationCode;
  taskKey?: string;
  message: string;
}

export interface AiPlanTaskDraft {
  clientTaskKey: string;
  sourceAcademicEventId: string;
  title: string;
  todoType: Todo["todoType"];
  scheduledDate: string;
  startTime: string | null;
  estimatedDurationMinutes: number;
  priority: Todo["priority"];
  taskPhase: Todo["taskPhase"] | null;
  dependsOnClientTaskKey: string | null;
  carriedOverFromTodoId: string | null;
  recommendation: {
    needReasons: string[];
    placementReasons: string[];
    priorityReasons: string[];
    durationReasons: string[];
    personalizationReasons: string[];
    userRequestReasons: string[];
  };
}

export interface AiPlanDraft {
  interpretationSummary: string;
  interpretedConstraints: InterpretedPlanConstraints;
  tasks: AiPlanTaskDraft[];
  warnings: string[];
  questions: string[];
}

export interface NormalizedAiPlanInput {
  planStartDate: string;
  planEndDate: string;
  referenceWindowEndDate: string;
  academicEvents: Array<Pick<ExtractedItem, "id" | "title" | "itemType" | "courseName" | "date" | "time" | "isAllDay" | "scheduledWeek" | "scheduledWeekLabel" | "requirements" | "workload" | "examScope" | "estimatedDurationMinutes" | "assignmentType" | "researchNeeded" | "difficulty" | "deliverableComplexity" | "submissionMethod" | "requiredMaterials" | "gradingMethod" | "classMeetingTimes">>;
  calendarEvents: Array<Pick<CalendarEvent, "id" | "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType" | "source">>;
  incompleteTodos: Todo[];
  completedTodos: Todo[];
  lockedTodoIds: string[];
  planningProfile: GeneratePlanCommand["planningProfile"];
  userRequest: string;
  currentPlan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate" | "referenceWindowEndDate" | "generationRequest" | "summary" | "interpretationSummary" | "interpretedConstraints"> | null;
  affectedAcademicEventIds: string[];
  previousAcademicEvents: ExtractedItem[];
}

export interface AiPlanModelRequest {
  mode: AiPlanningMode;
  attempt: 1 | 2;
  input: NormalizedAiPlanInput;
  validationViolations: AiPlanViolation[];
}

export interface WeeklyPlanModelRunner {
  execute(request: AiPlanModelRequest): Promise<AiPlanDraft>;
}

export interface AiPlanningResult {
  operationId: string;
  weeklyPlan: WeeklyPlan;
  todos: Todo[];
  changed: boolean;
  changedTodoIds: string[];
  planDiff: PlanDiff;
  assistantMessage: AiMateMessage;
  validationError?: string;
  questions: string[];
}

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + amount); return next.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function weekday(date: string) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validTime(value: string | null) { return value === null || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function toMinutes(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function overlap(start: number, end: number, otherStart: number, otherEnd: number) { return start < otherEnd && otherStart < end; }
function exactKeys(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}
function stringArray(value: unknown) { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function validWeekday(value: unknown) { return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6; }
function uniqueValues<T>(values: T[]) { return new Set(values).size === values.length; }
function validConstraints(value: unknown): value is InterpretedPlanConstraints {
  const keys = ["maxDailyMinutes", "maxTasksByWeekday", "prohibitedWeekdays", "lightStudyWeekdays", "preferredStudyWeekdaysByEventId", "blockedTimeRanges"];
  if (!exactKeys(value, keys)) return false;
  const constraints = value as InterpretedPlanConstraints;
  if (constraints.maxDailyMinutes !== null && (!Number.isInteger(constraints.maxDailyMinutes) || constraints.maxDailyMinutes <= 0)) return false;
  if (!Array.isArray(constraints.maxTasksByWeekday) || constraints.maxTasksByWeekday.some((limit) =>
    !exactKeys(limit, ["weekday", "maxTasks"]) || !validWeekday(limit.weekday) || !Number.isInteger(limit.maxTasks) || limit.maxTasks < 0)) return false;
  if (new Set(constraints.maxTasksByWeekday.map((limit) => limit.weekday)).size !== constraints.maxTasksByWeekday.length) return false;
  if (!Array.isArray(constraints.prohibitedWeekdays) || !constraints.prohibitedWeekdays.every(validWeekday) || !uniqueValues(constraints.prohibitedWeekdays)
    || !Array.isArray(constraints.lightStudyWeekdays) || !constraints.lightStudyWeekdays.every(validWeekday) || !uniqueValues(constraints.lightStudyWeekdays)) return false;
  if (!Array.isArray(constraints.preferredStudyWeekdaysByEventId)
    || constraints.preferredStudyWeekdaysByEventId.some((preference) => !exactKeys(preference, ["sourceAcademicEventId", "weekdays"])
      || typeof preference.sourceAcademicEventId !== "string" || !preference.sourceAcademicEventId
      || !Array.isArray(preference.weekdays) || !preference.weekdays.every(validWeekday) || !uniqueValues(preference.weekdays))) return false;
  return Array.isArray(constraints.blockedTimeRanges) && constraints.blockedTimeRanges.every((range) =>
    exactKeys(range, ["weekday", "startTime", "endTime"]) && validWeekday(range.weekday)
      && typeof range.startTime === "string" && typeof range.endTime === "string" && validTime(range.startTime) && validTime(range.endTime)
      && toMinutes(range.startTime) < toMinutes(range.endTime));
}

function sanitizedAcademicEvent(item: ExtractedItem) {
  return {
    id: item.id, title: item.title, itemType: item.itemType, courseName: item.courseName, date: item.date, time: item.time,
    isAllDay: item.isAllDay, scheduledWeek: item.scheduledWeek, scheduledWeekLabel: item.scheduledWeekLabel,
    requirements: item.requirements, workload: item.workload, examScope: item.examScope, estimatedDurationMinutes: item.estimatedDurationMinutes,
    assignmentType: item.assignmentType, researchNeeded: item.researchNeeded, difficulty: item.difficulty,
    deliverableComplexity: item.deliverableComplexity, submissionMethod: item.submissionMethod,
    requiredMaterials: item.requiredMaterials, gradingMethod: item.gradingMethod, classMeetingTimes: item.classMeetingTimes,
  };
}

function updateAffectedSourceIds(input: { mode: AiPlanningMode; command: GeneratePlanCommand; plan: WeeklyPlan; currentTodos: Todo[]; affectedAcademicEventIds?: string[] }) {
  const explicit = input.affectedAcademicEventIds ?? [];
  if (input.mode !== "update" || explicit.length > 0) return new Set(explicit);
  const constraints = parsePlanConstraints(input.plan.generationRequest);
  const scheduledLoads = scheduledMinutesByDate(input.plan, input.command.calendarEvents, input.command.extractedItems);
  const taskLoads = taskMinutesByDate(input.currentTodos);
  return new Set(input.currentTodos.filter((todo) => {
    if (todo.isCompleted) return false;
    const capacity = effectiveDailyStudyCapacity(todo.scheduledDate, constraints, scheduledLoads, input.command.planningProfile.maxDailyStudyMinutes);
    if ((taskLoads.get(todo.scheduledDate) ?? 0) > capacity) return true;
    if (!todo.startTime) return false;
    const start = toMinutes(todo.startTime); const end = start + todo.estimatedDurationMinutes;
    return input.command.calendarEvents.some((event) => event.date === todo.scheduledDate
      && (event.isAllDay || Boolean(event.startTime && event.endTime && overlap(start, end, toMinutes(event.startTime), toMinutes(event.endTime)))));
  }).map((todo) => todo.sourceExtractedItemId));
}

export function normalizeAiPlanInput(input: {
  mode: AiPlanningMode; command: GeneratePlanCommand; plan: WeeklyPlan; currentTodos: Todo[];
  affectedAcademicEventIds?: string[]; previousAcademicEvents?: ExtractedItem[];
}): NormalizedAiPlanInput {
  const affected = updateAffectedSourceIds(input);
  const locked = input.mode === "generate" ? [] : input.currentTodos.filter((todo) => todo.isCompleted || (input.mode === "update" && !affected.has(todo.sourceExtractedItemId)));
  const academicEvents = input.command.extractedItems.filter((item) => {
    if (item.itemType === "class-schedule") return item.confirmationStatus === "confirmed";
    if (item.confirmationStatus !== "confirmed" || !item.date) return false;
    const days = daysBetween(input.plan.weekStartDate, item.date);
    return days >= 0 && days <= 27;
  }).map(sanitizedAcademicEvent);
  const currentPlan = input.mode === "generate" ? null : {
    weekStartDate: input.plan.weekStartDate, weekEndDate: input.plan.weekEndDate, referenceWindowEndDate: input.plan.referenceWindowEndDate,
    generationRequest: input.plan.generationRequest, summary: input.plan.summary,
    interpretationSummary: input.plan.interpretationSummary, interpretedConstraints: input.plan.interpretedConstraints,
  };
  const sourceById = new Map(input.command.extractedItems.map((item) => [item.id, item]));
  const validCarryOvers = input.command.existingIncompleteTodos.filter((todo) => {
    const source = sourceById.get(todo.sourceExtractedItemId);
    return !todo.isCompleted && Boolean(source) && source!.confirmationStatus === "confirmed"
      && (source!.itemType === "class-schedule" || !source!.date || source!.date >= input.plan.weekStartDate);
  });
  return {
    planStartDate: input.plan.weekStartDate, planEndDate: input.plan.weekEndDate, referenceWindowEndDate: input.plan.referenceWindowEndDate,
    academicEvents,
    calendarEvents: input.command.calendarEvents.map(({ id, title, date, startTime, endTime, isAllDay, eventType, source }) => ({ id, title, date, startTime, endTime, isAllDay, eventType, source })),
    incompleteTodos: (input.mode === "generate" ? validCarryOvers : input.currentTodos).filter((todo) => !todo.isCompleted),
    completedTodos: input.currentTodos.filter((todo) => todo.isCompleted),
    lockedTodoIds: locked.map((todo) => todo.id), planningProfile: input.command.planningProfile, userRequest: input.command.requestText,
    currentPlan, affectedAcademicEventIds: [...affected], previousAcademicEvents: (input.previousAcademicEvents ?? []).map(sanitizedAcademicEvent) as ExtractedItem[],
  };
}

export function validateAiPlanDraft(draft: AiPlanDraft, context: {
  mode: AiPlanningMode; command: GeneratePlanCommand; plan: WeeklyPlan; currentTodos: Todo[]; affectedAcademicEventIds?: string[];
}) {
  const violations: AiPlanViolation[] = [];
  const affected = updateAffectedSourceIds(context);
  const lockedTodos = context.mode === "generate" ? [] : context.currentTodos.filter((todo) => todo.isCompleted || (context.mode === "update" && !affected.has(todo.sourceExtractedItemId)));
  const rootKeys = ["interpretationSummary", "interpretedConstraints", "tasks", "warnings", "questions"];
  if (!exactKeys(draft, rootKeys) || typeof draft.interpretationSummary !== "string" || !draft.interpretationSummary.trim()
    || !validConstraints(draft.interpretedConstraints) || !Array.isArray(draft.tasks)
    || !stringArray(draft.warnings) || !stringArray(draft.questions)) {
    violations.push({ code: "SCHEMA_MISMATCH", message: "AI 응답이 주간계획 JSON Schema와 일치하지 않습니다." });
    return { violations, lockedTodos, todos: lockedTodos };
  }
  const taskKeys = ["clientTaskKey", "sourceAcademicEventId", "title", "todoType", "scheduledDate", "startTime", "estimatedDurationMinutes", "priority", "taskPhase", "dependsOnClientTaskKey", "carriedOverFromTodoId", "recommendation"];
  const recommendationKeys = ["needReasons", "placementReasons", "priorityReasons", "durationReasons", "personalizationReasons", "userRequestReasons"];
  const inputEvents = new Map(context.command.extractedItems.map((item) => [item.id, item]));
  const horizonIds = new Set(context.command.extractedItems.filter((item) => item.itemType === "class-schedule"
    ? item.confirmationStatus === "confirmed"
    : item.confirmationStatus === "confirmed" && item.date && daysBetween(context.plan.weekStartDate, item.date) >= 0 && daysBetween(context.plan.weekStartDate, item.date) <= 27).map((item) => item.id));
  const carryOverById = new Map(context.command.existingIncompleteTodos.filter((todo) => !todo.isCompleted).map((todo) => [todo.id, todo]));
  const todoTypes = new Set<Todo["todoType"]>(["assignment-work", "exam-study", "class-prep", "review"]);
  const priorities = new Set<Todo["priority"]>(["high", "medium", "low"]);
  const phases = new Set<NonNullable<Todo["taskPhase"]>>(["prepare", "research", "draft", "work", "review", "finalize"]);
  const keys = new Set<string>(); const semanticKeys = new Set<string>();
  for (const task of draft.tasks) {
    if (!exactKeys(task, taskKeys) || !exactKeys(task.recommendation, recommendationKeys)) {
      violations.push({ code: "SCHEMA_MISMATCH", taskKey: task?.clientTaskKey, message: "Task에 허용되지 않은 필드가 있거나 필수 추천 근거가 없습니다." }); continue;
    }
    if (typeof task.clientTaskKey !== "string" || !task.clientTaskKey.trim() || typeof task.sourceAcademicEventId !== "string"
      || typeof task.title !== "string" || !task.title.trim() || !todoTypes.has(task.todoType) || !priorities.has(task.priority)
      || task.taskPhase === undefined || (task.taskPhase !== null && !phases.has(task.taskPhase)) || (task.dependsOnClientTaskKey !== null && typeof task.dependsOnClientTaskKey !== "string")
      || (task.carriedOverFromTodoId !== null && typeof task.carriedOverFromTodoId !== "string")
      || !recommendationKeys.every((key) => stringArray(task.recommendation[key as keyof typeof task.recommendation]))
      || task.recommendation.needReasons.length === 0 || task.recommendation.placementReasons.length === 0
      || task.recommendation.priorityReasons.length === 0 || task.recommendation.durationReasons.length === 0) {
      violations.push({ code: "SCHEMA_MISMATCH", taskKey: task.clientTaskKey, message: "Task의 enum, 문자열 또는 추천 근거 형식이 올바르지 않습니다." });
      continue;
    }
    if (keys.has(task.clientTaskKey) || semanticKeys.has(`${task.sourceAcademicEventId}:${task.title}`)) violations.push({ code: "DUPLICATE_TASK", taskKey: task.clientTaskKey, message: "동일한 학습 작업이 중복 생성되었습니다." });
    keys.add(task.clientTaskKey); semanticKeys.add(`${task.sourceAcademicEventId}:${task.title}`);
    const source = inputEvents.get(task.sourceAcademicEventId);
    const carried = task.carriedOverFromTodoId ? carryOverById.get(task.carriedOverFromTodoId) : undefined;
    const validCarryOver = Boolean(carried && carried.sourceExtractedItemId === task.sourceAcademicEventId && source?.confirmationStatus === "confirmed"
      && (source.itemType === "class-schedule" || !source.date || source.date >= context.plan.weekStartDate));
    if (!source || (!horizonIds.has(task.sourceAcademicEventId) && !validCarryOver)) violations.push({ code: "UNKNOWN_ACADEMIC_EVENT", taskKey: task.clientTaskKey, message: "존재하지 않거나 계획 범위 밖인 학업 일정을 참조했습니다." });
    else if (source.confirmationStatus !== "confirmed") violations.push({ code: "UNCONFIRMED_ACADEMIC_EVENT", taskKey: task.clientTaskKey, message: "확정되지 않은 학업 일정은 주간계획의 근거로 사용할 수 없습니다." });
    if (context.mode === "update" && !affected.has(task.sourceAcademicEventId)) violations.push({ code: "UNRELATED_TASK_CHANGED", taskKey: task.clientTaskKey, message: "변경 사실과 관련 없는 Task를 AI가 수정하려고 했습니다." });
    if (!validDate(task.scheduledDate)) violations.push({ code: "INVALID_DATE", taskKey: task.clientTaskKey, message: "Task 날짜가 YYYY-MM-DD의 실제 날짜가 아닙니다." });
    else if (task.scheduledDate < context.plan.weekStartDate || task.scheduledDate > context.plan.weekEndDate) violations.push({ code: "TASK_OUTSIDE_PLAN", taskKey: task.clientTaskKey, message: "Task가 7일 계획 범위 밖에 배치되었습니다." });
    if (source?.date && task.scheduledDate > source.date) violations.push({ code: "TASK_AFTER_DEADLINE", taskKey: task.clientTaskKey, message: "Task가 원본 AcademicEvent 마감일 이후에 배치되었습니다." });
    if (!validTime(task.startTime)) violations.push({ code: "INVALID_TIME", taskKey: task.clientTaskKey, message: "Task 시작 시간이 HH:mm 형식이 아닙니다." });
    if (!Number.isInteger(task.estimatedDurationMinutes) || task.estimatedDurationMinutes <= 0) violations.push({ code: "INVALID_DURATION", taskKey: task.clientTaskKey, message: "예상 소요시간은 양의 정수여야 합니다." });
    if (validTime(task.startTime) && task.startTime && Number.isInteger(task.estimatedDurationMinutes) && toMinutes(task.startTime) + task.estimatedDurationMinutes > 1_440) violations.push({ code: "INVALID_TIME", taskKey: task.clientTaskKey, message: "Task 종료 시간이 해당 날짜를 넘습니다." });
    if (task.dependsOnClientTaskKey && !draft.tasks.some((candidate) => candidate.clientTaskKey === task.dependsOnClientTaskKey)) violations.push({ code: "INVALID_DEPENDENCY", taskKey: task.clientTaskKey, message: "존재하지 않는 선행 Task를 참조했습니다." });
    if (task.carriedOverFromTodoId && !validCarryOver) violations.push({ code: "UNKNOWN_ACADEMIC_EVENT", taskKey: task.clientTaskKey, message: "유효하지 않거나 만료된 미완료 할 일을 이월하려고 했습니다." });
  }
  const completedMinutesBySource = new Map<string, number>();
  const existingMinutesBySource = new Map<string, number>();
  context.currentTodos.filter((todo) => todo.isCompleted).forEach((todo) => completedMinutesBySource.set(todo.sourceExtractedItemId, (completedMinutesBySource.get(todo.sourceExtractedItemId) ?? 0) + todo.estimatedDurationMinutes));
  context.currentTodos.forEach((todo) => existingMinutesBySource.set(todo.sourceExtractedItemId, (existingMinutesBySource.get(todo.sourceExtractedItemId) ?? 0) + todo.estimatedDurationMinutes));
  for (const source of context.command.extractedItems.filter((item) => item.itemType !== "class-schedule" && item.confirmationStatus === "confirmed" && item.date && item.date >= context.plan.weekStartDate && item.date <= context.plan.weekEndDate)) {
    if (context.mode === "update" && !affected.has(source.id)) continue;
    const sourceTasks = draft.tasks.filter((task) => task.sourceAcademicEventId === source.id);
    const completedMinutes = completedMinutesBySource.get(source.id) ?? 0;
    if (sourceTasks.length === 0 && completedMinutes === 0) violations.push({ code: "REQUIRED_EVENT_TASK_MISSING", message: `${source.title}의 마감 전 필수 학습 작업이 누락되었습니다.` });
    const proposedMinutes = sourceTasks.reduce((sum, task) => sum + (Number.isInteger(task.estimatedDurationMinutes) ? task.estimatedDurationMinutes : 0), completedMinutes);
    const mustUseSourceEstimate = context.mode === "generate" || (context.mode === "update" && (context.affectedAcademicEventIds?.length ?? 0) > 0);
    const minimumMinutes = mustUseSourceEstimate ? source.estimatedDurationMinutes ?? 0 : existingMinutesBySource.get(source.id) ?? 0;
    if (minimumMinutes > 0 && proposedMinutes < minimumMinutes) violations.push({ code: "INSUFFICIENT_EVENT_WORK", message: `${source.title}의 예상 작업량을 capacity에 맞춰 임의로 축소했습니다.` });
  }
  for (const task of draft.tasks) {
    if (!validDate(task.scheduledDate) || !validTime(task.startTime) || !task.startTime || task.estimatedDurationMinutes <= 0) continue;
    const start = toMinutes(task.startTime); const end = start + task.estimatedDurationMinutes;
    const calendarCollision = context.command.calendarEvents.some((event) => event.date === task.scheduledDate && (event.isAllDay || Boolean(event.startTime && event.endTime && overlap(start, end, toMinutes(event.startTime), toMinutes(event.endTime)))));
    const classCollision = context.command.extractedItems.filter((item) => item.itemType === "class-schedule" && item.confirmationStatus === "confirmed")
      .some((item) => item.classMeetingTimes.some((meeting) => meeting.weekday === weekday(task.scheduledDate) && overlap(start, end, toMinutes(meeting.startTime), toMinutes(meeting.endTime))));
    const blockedCollision = draft.interpretedConstraints.blockedTimeRanges.some((range) => range.weekday === weekday(task.scheduledDate) && validTime(range.startTime) && validTime(range.endTime) && overlap(start, end, toMinutes(range.startTime), toMinutes(range.endTime)));
    if (calendarCollision || classCollision || blockedCollision) violations.push({ code: "SCHEDULE_TIME_COLLISION", taskKey: task.clientTaskKey, message: "Task 시간이 개인 일정, 수업 또는 금지 시간대와 겹칩니다." });
  }
  const parsed = parsePlanConstraints(context.command.requestText);
  if (parsed.maxDailyMinutes !== null && draft.interpretedConstraints.maxDailyMinutes !== parsed.maxDailyMinutes) violations.push({ code: "REQUEST_CONSTRAINT_MISMATCH", message: "AI가 해석한 하루 최대 학습시간이 사용자 원문과 일치하지 않습니다." });
  for (const [day, maximum] of Object.entries(parsed.maxTasksByWeekday)) if (draft.interpretedConstraints.maxTasksByWeekday.find((limit) => limit.weekday === Number(day))?.maxTasks !== maximum) violations.push({ code: "REQUEST_CONSTRAINT_MISMATCH", message: `${day} 요일 최대 Task 수 해석이 사용자 원문과 일치하지 않습니다.` });
  for (const day of Object.keys(parsed.maxMinutesByWeekday).map(Number)) if (!draft.interpretedConstraints.lightStudyWeekdays.includes(day)) violations.push({ code: "REQUEST_CONSTRAINT_MISMATCH", message: "AI가 사용자 원문의 가벼운 학습 요일을 누락했습니다." });
  for (const day of parsed.prohibitedWeekdays) if (!draft.interpretedConstraints.prohibitedWeekdays.includes(day)) violations.push({ code: "REQUEST_CONSTRAINT_MISMATCH", message: "AI가 사용자 원문의 금지 요일을 누락했습니다." });
  for (const preference of draft.interpretedConstraints.preferredStudyWeekdaysByEventId) if (!horizonIds.has(preference.sourceAcademicEventId)) violations.push({ code: "UNKNOWN_ACADEMIC_EVENT", message: "선호 요일 조건이 입력에 없는 학업 일정을 참조했습니다." });
  const effectiveConstraints = {
    maxTasksByWeekday: Object.fromEntries(draft.interpretedConstraints.maxTasksByWeekday.map((limit) => [limit.weekday, limit.maxTasks])) as Partial<Record<number, number>>,
    maxMinutesByWeekday: parsed.maxMinutesByWeekday, prohibitedWeekdays: draft.interpretedConstraints.prohibitedWeekdays,
    maxDailyMinutes: draft.interpretedConstraints.maxDailyMinutes, preferredWeekdays: [],
  };
  const scheduledLoads = scheduledMinutesByDate(context.plan, context.command.calendarEvents, context.command.extractedItems);
  const draftTodos = draft.tasks.map((task, index): Todo => ({
    id: `draft-${index}`, weeklyPlanId: context.plan.id, sourceExtractedItemId: task.sourceAcademicEventId,
    scheduledDate: task.scheduledDate, startTime: task.startTime, title: task.title, todoType: task.todoType,
    courseName: inputEvents.get(task.sourceAcademicEventId)?.courseName ?? "", estimatedDurationMinutes: task.estimatedDurationMinutes,
    priority: task.priority, isCompleted: false, recommendationReason: task.recommendation.placementReasons.join(". "),
    durationRationale: task.recommendation.durationReasons, carriedOverFromTodoId: task.carriedOverFromTodoId,
  }));
  const allTodos = [...lockedTodos, ...draftTodos]; const loads = taskMinutesByDate(allTodos);
  for (const date of Array.from({ length: 7 }, (_, index) => addDays(context.plan.weekStartDate, index))) {
    const active = allTodos.filter((todo) => !todo.isCompleted && todo.scheduledDate === date);
    if (effectiveConstraints.prohibitedWeekdays.includes(weekday(date)) && active.length) violations.push({ code: "PROHIBITED_WEEKDAY", message: `${date}는 사용자가 금지한 학습 요일입니다.` });
    const maximum = effectiveConstraints.maxTasksByWeekday[weekday(date)];
    if (maximum !== undefined && active.length > maximum) violations.push({ code: "WEEKDAY_TASK_LIMIT_EXCEEDED", message: `${date}의 Task 수가 사용자 제한을 넘습니다.` });
    const capacity = effectiveDailyStudyCapacity(date, effectiveConstraints, scheduledLoads, context.command.planningProfile.maxDailyStudyMinutes);
    if ((loads.get(date) ?? 0) > capacity) violations.push({ code: "DAILY_MINUTES_EXCEEDED", message: `${date}의 학습시간이 실질적인 일일 capacity를 넘습니다.` });
  }
  const taskByKey = new Map(draft.tasks.map((task) => [task.clientTaskKey, task]));
  for (const task of draft.tasks) if (task.dependsOnClientTaskKey) {
    const predecessor = taskByKey.get(task.dependsOnClientTaskKey);
    if (predecessor && predecessor.scheduledDate >= task.scheduledDate) violations.push({ code: "INVALID_DEPENDENCY", taskKey: task.clientTaskKey, message: "후속 Task가 선행 Task보다 먼저 또는 같은 날짜에 배치되었습니다." });
  }
  return { violations: [...new Map(violations.map((item) => [`${item.code}:${item.taskKey ?? ""}:${item.message}`, item])).values()], lockedTodos, todos: allTodos };
}

function materialize(draft: AiPlanDraft, command: GeneratePlanCommand, plan: WeeklyPlan, lockedTodos: Todo[], currentTodos: Todo[]) {
  const sourceById = new Map(command.extractedItems.map((item) => [item.id, item]));
  const reusable = new Map<string, Todo[]>();
  currentTodos.filter((todo) => !todo.isCompleted && !lockedTodos.some((locked) => locked.id === todo.id)).forEach((todo) => {
    const key = `${todo.sourceExtractedItemId}:${todo.title}`; reusable.set(key, [...(reusable.get(key) ?? []), todo]);
  });
  const idByKey = new Map(draft.tasks.map((task, index) => {
    const key = `${task.sourceAcademicEventId}:${task.title}`; const existing = reusable.get(key)?.shift();
    return [task.clientTaskKey, existing?.id ?? `todo-${command.operationId}-${index}`];
  }));
  return [...lockedTodos, ...draft.tasks.map((task): Todo => ({
    id: idByKey.get(task.clientTaskKey)!, weeklyPlanId: plan.id, sourceExtractedItemId: task.sourceAcademicEventId,
    scheduledDate: task.scheduledDate, startTime: task.startTime, title: task.title, todoType: task.todoType,
    courseName: sourceById.get(task.sourceAcademicEventId)?.courseName ?? "", estimatedDurationMinutes: task.estimatedDurationMinutes,
    priority: task.priority, isCompleted: false, recommendationReason: task.recommendation.placementReasons.join(". "),
    durationRationale: task.recommendation.durationReasons, carriedOverFromTodoId: task.carriedOverFromTodoId,
    taskPhase: task.taskPhase ?? undefined, dependsOnTodoId: task.dependsOnClientTaskKey ? idByKey.get(task.dependsOnClientTaskKey) ?? null : null,
    recommendationDetails: { relatedAcademicEventId: task.sourceAcademicEventId, ...task.recommendation, carriedOver: Boolean(task.carriedOverFromTodoId), provisionalExamStudy: false },
  }))];
}

function diff(before: Todo[], after: Todo[], trigger: string): PlanDiff {
  const beforeById = new Map(before.map((todo) => [todo.id, todo])); const afterById = new Map(after.map((todo) => [todo.id, todo]));
  const addedTaskIds = after.filter((todo) => !beforeById.has(todo.id)).map((todo) => todo.id);
  const removedTaskIds = before.filter((todo) => !afterById.has(todo.id)).map((todo) => todo.id);
  const movedTasks = after.flatMap((todo) => { const old = beforeById.get(todo.id); return old && old.scheduledDate !== todo.scheduledDate ? [{ taskId: todo.id, from: old.scheduledDate, to: todo.scheduledDate }] : []; });
  const durationChanges = after.flatMap((todo) => { const old = beforeById.get(todo.id); return old && old.estimatedDurationMinutes !== todo.estimatedDurationMinutes ? [{ taskId: todo.id, beforeMinutes: old.estimatedDurationMinutes, afterMinutes: todo.estimatedDurationMinutes }] : []; });
  const modifiedTaskIds = after.flatMap((todo) => {
    const old = beforeById.get(todo.id);
    if (!old) return [];
    const beforeValue = [old.title, old.startTime ?? null, old.priority, old.taskPhase ?? null, old.dependsOnTodoId ?? null];
    const afterValue = [todo.title, todo.startTime ?? null, todo.priority, todo.taskPhase ?? null, todo.dependsOnTodoId ?? null];
    return JSON.stringify(beforeValue) === JSON.stringify(afterValue) ? [] : [todo.id];
  });
  return { triggeringChange: trigger, addedTaskIds, removedTaskIds, movedTasks, durationChanges, changedTaskIds: [...new Set([...addedTaskIds, ...removedTaskIds, ...movedTasks.map((item) => item.taskId), ...durationChanges.map((item) => item.taskId), ...modifiedTaskIds])], reasons: ["AI 초안을 절대 규칙으로 검증한 최소 변경"] };
}

function formatKoreanPlanDate(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function summarizeCourses(todos: Todo[]) {
  const courses = [...new Set(todos.map((todo) => todo.courseName.trim()).filter(Boolean))];
  if (courses.length === 0) return "이번 주";
  if (courses.length <= 2) return courses.join(", ");
  return `${courses.slice(0, 2).join(", ")} 등`;
}

function userFacingGenerationSummary(input: {
  command: GeneratePlanCommand;
  plan: WeeklyPlan;
  todos: Todo[];
}) {
  const activeTodos = input.todos.filter((todo) => !todo.isCompleted);
  const period = `${formatKoreanPlanDate(input.plan.weekStartDate)}부터 ${formatKoreanPlanDate(input.plan.weekEndDate)}까지의 주간계획을 만들었어요.`;
  if (activeTodos.length === 0) return `${period} 이번 주에는 새로 배치할 할 일이 없어요.`;

  const sourceById = new Map(input.command.extractedItems.map((item) => [item.id, item]));
  const timetableOnly = activeTodos.every((todo) => sourceById.get(todo.sourceExtractedItemId)?.itemType === "class-schedule");
  const courses = summarizeCourses(activeTodos);
  const taskDescription = timetableOnly
    ? `시간표를 바탕으로 ${courses} 수업 준비와 복습 할 일 ${activeTodos.length}개를 배치했어요.`
    : `마감일과 예정 일정을 고려해 ${courses} 관련 할 일 ${activeTodos.length}개를 배치했어요.`;
  const carryOver = activeTodos.some((todo) => Boolean(todo.carriedOverFromTodoId))
    ? " 이전에 끝내지 못한 할 일도 함께 반영했어요."
    : "";
  return `${period} ${taskDescription}${carryOver}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return "AI 모델 실행 시간이 초과됐어요.";
  return error instanceof Error ? error.message : "AI 모델 실행에 실패했어요.";
}

export async function runAiPlanning(input: {
  mode: AiPlanningMode; command: GeneratePlanCommand; runner: WeeklyPlanModelRunner; currentPlan?: WeeklyPlan | null; currentTodos?: Todo[];
  affectedAcademicEventIds?: string[]; previousAcademicEvents?: ExtractedItem[];
}): Promise<AiPlanningResult> {
  const window = input.currentPlan ?? (() => { const dates = getPlanWeekWindow(new Date(input.command.requestedAt)); return { id: `weekly-${input.command.operationId}`, userId: input.command.user.id, ...dates, status: "complete" as const, createdAt: input.command.requestedAt, generationRequest: input.command.requestText, summary: "AI가 생성하고 절대 규칙으로 검증한 7일 계획" }; })();
  const currentTodos = input.currentTodos ?? [];
  const normalized = normalizeAiPlanInput({ mode: input.mode, command: input.command, plan: window, currentTodos, affectedAcademicEventIds: input.affectedAcademicEventIds, previousAcademicEvents: input.previousAcademicEvents });
  if (input.mode === "generate" && normalized.academicEvents.length === 0 && normalized.incompleteTodos.length === 0) {
    const message = "아직 확정된 과제나 시험 일정이 없어요. 시간표를 업로드하면 수업 일정을 바탕으로 이번 주 복습 계획부터 만들 수 있어요. Upload에서 시간표 이미지나 PDF를 추가해주세요.";
    return {
      operationId: input.command.operationId, weeklyPlan: window, todos: currentTodos, changed: false, changedTodoIds: [],
      planDiff: diff(currentTodos, currentTodos, "계획 가능한 학업 정보 없음"), validationError: message, questions: [],
      assistantMessage: {
        id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent",
        intent: "generate-plan", operationId: input.command.operationId, text: message,
        actions: [{ label: "시간표 업로드하기", href: "/upload" }],
      },
    };
  }
  let lastViolations: AiPlanViolation[] = [];
  for (const attempt of [1, 2] as const) {
    let draft: AiPlanDraft;
    try { draft = await input.runner.execute({ mode: input.mode, attempt, input: normalized, validationViolations: lastViolations }); }
    catch (error) {
      const message = errorMessage(error); const planDiff = diff(currentTodos, currentTodos, "모델 실행 실패");
      return { operationId: input.command.operationId, weeklyPlan: window, todos: currentTodos, changed: false, changedTodoIds: [], planDiff, validationError: message, questions: [], assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "failed", intent: input.mode === "generate" ? "generate-plan" : input.mode === "update" ? "update-plan" : "adjust-plan", operationId: input.command.operationId, text: `${message} 기존 계획은 그대로 유지했어요.` } };
    }
    if (input.mode !== "adjust" && Array.isArray(draft.questions) && draft.questions.length > 0) {
      draft = { ...draft, questions: [] };
    }
    if (draft && Array.isArray(draft.questions) && Array.isArray(draft.tasks) && draft.questions.length > 0 && draft.tasks.length === 0) {
      const planDiff = diff(currentTodos, currentTodos, "추가 정보 질문");
      return { operationId: input.command.operationId, weeklyPlan: window, todos: currentTodos, changed: false, changedTodoIds: [], planDiff, questions: draft.questions,
        assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent", intent: input.mode === "generate" ? "generate-plan" : input.mode === "update" ? "update-plan" : "adjust-plan", operationId: input.command.operationId, text: draft.questions[0] } };
    }
    const validation = validateAiPlanDraft(draft, { mode: input.mode, command: input.command, plan: window, currentTodos, affectedAcademicEventIds: input.affectedAcademicEventIds });
    if (!validation.violations.length) {
      const todos = materialize(draft, input.command, window, validation.lockedTodos, currentTodos);
      const planDiff = diff(currentTodos, todos, draft.interpretationSummary); const changed = input.mode === "generate" || planDiff.changedTaskIds.length > 0;
      const summary = input.mode === "generate"
        ? userFacingGenerationSummary({ command: input.command, plan: window, todos })
        : draft.interpretationSummary;
      const plan: WeeklyPlan = { ...window, summary, interpretationSummary: draft.interpretationSummary, interpretedConstraints: draft.interpretedConstraints };
      const successMessage = input.mode === "generate" ? summary : `${summary} 변경이 필요한 할 일만 반영했어요.`;
      return { operationId: input.command.operationId, weeklyPlan: plan, todos: changed ? todos : currentTodos, changed, changedTodoIds: planDiff.changedTaskIds, planDiff, questions: draft.questions, assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "sent", intent: input.mode === "generate" ? "generate-plan" : input.mode === "update" ? "update-plan" : "adjust-plan", operationId: input.command.operationId, text: changed ? successMessage : "요청을 검토했지만 실제로 변경할 계획 항목은 없었어요." } };
    }
    lastViolations = validation.violations;
  }
  const reason = lastViolations.map((violation) => violation.message).join(" "); const planDiff = diff(currentTodos, currentTodos, "재생성 실패");
  return { operationId: input.command.operationId, weeklyPlan: window, todos: currentTodos, changed: false, changedTodoIds: [], planDiff, validationError: reason, questions: [], assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", createdAt: input.command.requestedAt, status: "failed", intent: input.mode === "generate" ? "generate-plan" : input.mode === "update" ? "update-plan" : "adjust-plan", operationId: input.command.operationId, text: `AI가 두 번 제안했지만 절대 규칙을 지키지 못해 저장하지 않았어요. ${reason} 기존 계획은 그대로 유지했어요.` } };
}
