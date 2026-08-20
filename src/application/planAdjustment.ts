import type { AiMateMessage, CalendarEvent, ExtractedItem, GeneratePlanCommand, Todo, WeeklyPlan } from "../domain/types";
import { adjustPlanDeterministically, type AdjustPlanInput } from "./deterministicPlanAdjuster";
import { parsePlanConstraints, taskMinutesByDate, validatePlanConstraints } from "./planConstraints";

export type AdjustmentOperationType =
  | "move" | "split" | "increase_duration" | "decrease_duration" | "set_duration"
  | "prioritize" | "deprioritize" | "reduce_daily_load" | "set_daily_limit"
  | "set_weekday_task_limit" | "prohibit_weekday" | "lighten_weekday" | "rebalance_before_deadline"
  | "rebalance_before_class";

export interface AdjustmentOperation {
  type: AdjustmentOperationType;
  targetTodoIds: string[];
  targetAcademicEventIds: string[];
  scheduledDate: string | null;
  weekday: number | null;
  minutes: number | null;
  taskCount: number | null;
}

export interface AdjustmentCommandDraft {
  interpretationSummary: string;
  operations: AdjustmentOperation[];
  constraints: {
    maxDailyMinutes: number | null;
    maxTasksByWeekday: Array<{ weekday: number; maxTasks: number }>;
    prohibitedWeekdays: number[];
    preferredWeekdays: number[];
  };
  warnings: string[];
  questions: string[];
}

interface AdjustmentTodoSummary {
  id: string; sourceAcademicEventId: string; title: string; scheduledDate: string; startTime: string | null;
  estimatedDurationMinutes: number; priority: Todo["priority"]; isCompleted: boolean; taskPhase: Todo["taskPhase"] | null; dependsOnTodoId: string | null;
}

export interface AdjustmentModelInput {
  planStartDate: string;
  planEndDate: string;
  userRequest: string;
  selectedTodoId: string | null;
  candidateTodos: AdjustmentTodoSummary[];
  completedTodoIds: string[];
  lockedTodoIds: string[];
  academicEvents: Array<{ id: string; itemType: ExtractedItem["itemType"]; date: string | null; confirmationStatus: ExtractedItem["confirmationStatus"] }>;
  dailyTaskMinutes: Array<{ date: string; minutes: number }>;
  scheduleBlocks: Array<{ date: string; startTime: string | null; endTime: string | null; isAllDay: boolean; kind: "calendar" | "class" }>;
  maxDailyStudyMinutes: number | null;
  currentConstraints: ReturnType<typeof parsePlanConstraints>;
}

export interface AdjustmentModelRequest {
  operationId: string;
  attempt: 1 | 2;
  input: AdjustmentModelInput;
  validationErrors: Array<{ code: string; message: string }>;
}

export interface AdjustmentCommandRunner {
  execute(request: AdjustmentModelRequest): Promise<AdjustmentCommandDraft>;
}

export type AdjustmentStage = "acknowledged" | "interpreting" | "rebalancing" | "validating";

export interface PlanAdjustmentResult {
  todos: Todo[];
  changed: boolean;
  changedTodoIds: string[];
  assistantMessage: AiMateMessage;
  validationError?: string;
  questions: string[];
  usedFastPath: boolean;
  modelAttempts: number;
  resultCode: "success" | "no-change" | "conflict" | "model-failure" | "question";
}

const weekdayLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const nowMs = () => typeof performance === "undefined" ? Date.now() : performance.now();
const internalAiTermPattern = /candidateTodos|completedTodoIds|lockedTodoIds|selectedTodoId|targetTodoIds|targetAcademicEventIds|sourceAcademicEventId|clientTaskKey|AcademicEvent|WeeklyPlan|Todo|Task|dependency|validation|schema|JSON/i;
const missingAcademicFactQuestionPattern = /(마감일|시험일|제출일|시험 범위|과제 요구사항).*(언제|알려|입력|추가)/;

function userFacingClarification(question: string, selectedTodoId: string | null) {
  const normalized = question.normalize("NFC").replace(/\s+/g, " ").trim();
  const fallback = selectedTodoId
    ? "선택한 할 일을 어떤 날짜나 학습량으로 조정하면 좋을지 알려주세요."
    : "조정할 할 일 또는 과목과 원하는 변경 내용을 알려주세요.";
  const safeQuestion = !normalized || normalized.length > 140 || internalAiTermPattern.test(normalized)
    ? fallback
    : normalized;
  return `조정 전에 한 가지만 확인할게요. ${safeQuestion}`;
}

function asksForMissingAcademicFact(question: string) {
  return missingAcademicFactQuestionPattern.test(question.normalize("NFC").replace(/\s+/g, " ").trim());
}

function missingAcademicFactMessage(operationId: string, requestedAt: string): AiMateMessage {
  return {
    id: `assistant-${operationId}`,
    role: "assistant",
    text: "요청을 확인했어요. 마감일이나 시험일 같은 학업 일정 정보는 AI Mate에서 새로 정하지 않아요. Upload의 학업 이벤트 확인 및 수정 화면에서 먼저 보완해주세요.",
    createdAt: requestedAt,
    status: "sent",
    intent: "adjust-plan",
    operationId,
  };
}

function diagnosticLog(meta: Record<string, string | number | boolean | null>) {
  console.info("[catchup:adjust]", meta);
}

const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function violationTouchesChangedTodos(violation: string, beforeTodos: Todo[], afterTodos: Todo[], changedTodoIds: string[]) {
  const changedIds = new Set(changedTodoIds);
  const changed = [...beforeTodos, ...afterTodos].filter((todo) => changedIds.has(todo.id));
  const changedDates = new Set(changed.map((todo) => todo.scheduledDate));
  const changedWeekdays = new Set(changed.map((todo) => new Date(`${todo.scheduledDate}T00:00:00Z`).getUTCDay()));
  return changed.some((todo) => violation.includes(todo.title))
    || [...changedDates].some((date) => violation.startsWith(date))
    || [...changedWeekdays].some((weekday) => violation.startsWith(weekdayNames[weekday]));
}

function violationMetric(violation: string) {
  const taskCount = violation.match(/^(.+요일) 할 일 (\d+)개\(최대 (\d+)개\)$/);
  if (taskCount) return { key: `weekday-task-limit:${taskCount[1]}`, severity: Number(taskCount[2]) - Number(taskCount[3]), aggregate: true };
  const dailyLoad = violation.match(/^(\d{4}-\d{2}-\d{2}) 학습량 (\d+)분\(실질 최대 (\d+)분\)$/);
  if (dailyLoad) return { key: `daily-load:${dailyLoad[1]}`, severity: Number(dailyLoad[2]) - Number(dailyLoad[3]), aggregate: true };
  return { key: violation, severity: 1, aggregate: false };
}

function blocksAdjustment(violation: string, baselineViolations: string[], beforeTodos: Todo[], afterTodos: Todo[], changedTodoIds: string[]) {
  const afterMetric = violationMetric(violation);
  const baselineMetric = baselineViolations.map(violationMetric).find((candidate) => candidate.key === afterMetric.key);
  if (!baselineMetric || afterMetric.severity > baselineMetric.severity) return true;
  return !afterMetric.aggregate && violationTouchesChangedTodos(violation, beforeTodos, afterTodos, changedTodoIds);
}

function selectedFromRequest(requestText: string, todos: Todo[], selectedTodoId: string | null) {
  const selected = todos.find((todo) => todo.id === selectedTodoId && !todo.isCompleted);
  if (selected) return selected;
  const quoted = requestText.match(/['"]([^'"]+)['"]/)?.[1]?.trim();
  if (!quoted) return undefined;
  const matches = todos.filter((todo) => !todo.isCompleted && todo.title === quoted);
  return matches.length === 1 ? matches[0] : undefined;
}

export function parseFastAdjustmentCommand(requestText: string, todos: Todo[], selectedTodoId: string | null, planStartDate?: string): AdjustmentCommandDraft | null {
  const text = requestText.normalize("NFC").replace(/\s+/g, " ").trim();
  const target = selectedFromRequest(text, todos, selectedTodoId);
  const constraints = parsePlanConstraints(text);
  const base = (operation: AdjustmentOperation, summary: string): AdjustmentCommandDraft => ({
    interpretationSummary: summary, operations: [operation],
    constraints: {
      maxDailyMinutes: constraints.maxDailyMinutes,
      maxTasksByWeekday: Object.entries(constraints.maxTasksByWeekday).flatMap(([weekday, maxTasks]) => maxTasks === undefined ? [] : [{ weekday: Number(weekday), maxTasks }]),
      prohibitedWeekdays: constraints.prohibitedWeekdays, preferredWeekdays: constraints.preferredWeekdays,
    }, warnings: [], questions: [],
  });
  const targetFields = { targetTodoIds: target ? [target.id] : [], targetAcademicEventIds: target ? [target.sourceExtractedItemId] : [] };
  const emptyFields = { scheduledDate: null, weekday: null, minutes: null, taskCount: null };
  if (target && /마감(?:일)?(?:에|까지).*(?:맞춰|재조정|조정|분산|재배치)|마감.*(?:맞춰|다시 조정)/.test(text)) return base({ type: "rebalance_before_deadline", ...targetFields, ...emptyFields }, "마감 전 작업 순서와 날짜별 학습량에 맞춰 재배치합니다.");
  if (target && /(?:다음\s*)?수업(?:일|\s*일정|\s*시간).*(?:반영|고려|맞춰).*(?:조정|재배치)|수업(?:일|\s*일정|\s*시간).*(?:조정|재배치)/.test(text)) return base({ type: "rebalance_before_class", ...targetFields, ...emptyFields }, "다음 수업 전에 준비를 마칠 수 있도록 재배치합니다.");
  const isoDate = text.match(/20\d{2}-\d{2}-\d{2}/)?.[0];
  const koreanDate = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  const explicitDate = isoDate ?? (koreanDate && planStartDate ? `${planStartDate.slice(0, 4)}-${koreanDate[1].padStart(2, "0")}-${koreanDate[2].padStart(2, "0")}` : null);
  if (target && explicitDate && /(옮겨|이동|배치)/.test(text)) return base({ type: "move", ...targetFields, ...emptyFields, scheduledDate: explicitDate }, `${explicitDate}로 이동합니다.`);
  const weekday = weekdayLabels.findIndex((label) => text.includes(label));
  if (target && weekday >= 0 && /(옮겨|이동|배치)/.test(text)) return base({ type: "move", ...targetFields, ...emptyFields, weekday }, `${weekdayLabels[weekday]}로 이동합니다.`);
  if (target && /(나눠|분할)/.test(text)) return base({ type: "split", ...targetFields, ...emptyFields, weekday: weekday >= 0 ? weekday : null }, "선택한 할 일을 가능한 날짜로 나눕니다.");
  if (target && /(시간.*늘려|조금 더|공부시간.*늘)/.test(text)) return base({ type: "increase_duration", ...targetFields, ...emptyFields }, "선택한 할 일의 학습시간을 늘립니다.");
  if (target && /(시간.*줄여|조금 덜|공부시간.*줄)/.test(text)) return base({ type: "decrease_duration", ...targetFields, ...emptyFields }, "선택한 할 일의 학습시간을 줄입니다.");
  if (target && /(우선|먼저)/.test(text)) return base({ type: "prioritize", ...targetFields, ...emptyFields }, "선택한 할 일을 우선합니다.");
  if (constraints.maxDailyMinutes !== null) return base({ type: "set_daily_limit", ...targetFields, ...emptyFields, minutes: constraints.maxDailyMinutes }, "일일 최대 학습시간을 적용합니다.");
  const weekdayMinuteLimit = Object.entries(constraints.maxMinutesByWeekday)[0];
  if (weekdayMinuteLimit?.[1] !== undefined) return base({ type: "set_daily_limit", ...targetFields, ...emptyFields, weekday: Number(weekdayMinuteLimit[0]), minutes: weekdayMinuteLimit[1] }, "요일별 최대 학습시간을 적용합니다.");
  const taskLimit = Object.entries(constraints.maxTasksByWeekday)[0];
  if (taskLimit?.[1] !== undefined) return base({ type: "set_weekday_task_limit", ...targetFields, ...emptyFields, weekday: Number(taskLimit[0]), taskCount: taskLimit[1] }, "요일별 최대 할 일 수를 적용합니다.");
  if (constraints.prohibitedWeekdays.length === 1) return base({ type: "prohibit_weekday", ...targetFields, ...emptyFields, weekday: constraints.prohibitedWeekdays[0] }, "요청한 요일을 쉬는 날로 설정합니다.");
  if (weekday >= 0 && /(줄여|가볍게)/.test(text)) return base({ type: "lighten_weekday", ...targetFields, ...emptyFields, weekday }, "요청한 요일의 학습량을 줄입니다.");
  if (/(오늘).*(줄여|가볍게)/.test(text)) return base({ type: "reduce_daily_load", ...targetFields, ...emptyFields }, "오늘의 학습량을 줄입니다.");
  return null;
}

function compactInput(command: GeneratePlanCommand, plan: WeeklyPlan, todos: Todo[], selectedTodoId: string | null): AdjustmentModelInput {
  const sourceIds = new Set(todos.map((todo) => todo.sourceExtractedItemId));
  const academicEvents = command.extractedItems.filter((item) => sourceIds.has(item.id)).map((item) => ({ id: item.id, itemType: item.itemType, date: item.date, confirmationStatus: item.confirmationStatus }));
  const classBlocks = command.extractedItems.filter((item) => item.itemType === "class-schedule" && item.confirmationStatus === "confirmed").flatMap((item) => item.classMeetingTimes.flatMap((meeting) => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${plan.weekStartDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + index); const iso = date.toISOString().slice(0, 10);
    return date.getUTCDay() === meeting.weekday ? [{ date: iso, startTime: meeting.startTime, endTime: meeting.endTime, isAllDay: false, kind: "class" as const }] : [];
  }).flatMap((block) => block)));
  return {
    planStartDate: plan.weekStartDate, planEndDate: plan.weekEndDate, userRequest: command.requestText, selectedTodoId,
    candidateTodos: todos.map((todo) => ({ id: todo.id, sourceAcademicEventId: todo.sourceExtractedItemId, title: todo.title, scheduledDate: todo.scheduledDate, startTime: todo.startTime ?? null, estimatedDurationMinutes: todo.estimatedDurationMinutes, priority: todo.priority, isCompleted: todo.isCompleted, taskPhase: todo.taskPhase ?? null, dependsOnTodoId: todo.dependsOnTodoId ?? null })),
    completedTodoIds: todos.filter((todo) => todo.isCompleted).map((todo) => todo.id), lockedTodoIds: todos.filter((todo) => todo.isCompleted).map((todo) => todo.id), academicEvents,
    dailyTaskMinutes: [...taskMinutesByDate(todos)].map(([date, minutes]) => ({ date, minutes })),
    scheduleBlocks: [...command.calendarEvents.filter((event) => event.date >= plan.weekStartDate && event.date <= plan.weekEndDate).map((event) => ({ date: event.date, startTime: event.startTime, endTime: event.endTime, isAllDay: event.isAllDay, kind: "calendar" as const })), ...classBlocks],
    maxDailyStudyMinutes: command.planningProfile.maxDailyStudyMinutes ?? null,
    currentConstraints: parsePlanConstraints(plan.generationRequest),
  };
}

function validateCommandDraft(draft: AdjustmentCommandDraft, input: AdjustmentModelInput) {
  const errors: Array<{ code: string; message: string }> = [];
  const todoById = new Map(input.candidateTodos.map((todo) => [todo.id, todo])); const todoIds = new Set(todoById.keys()); const eventIds = new Set(input.academicEvents.map((event) => event.id));
  const operationTypes = new Set<AdjustmentOperationType>(["move", "split", "increase_duration", "decrease_duration", "set_duration", "prioritize", "deprioritize", "reduce_daily_load", "set_daily_limit", "set_weekday_task_limit", "prohibit_weekday", "lighten_weekday", "rebalance_before_deadline", "rebalance_before_class"]);
  if (!draft || !Array.isArray(draft.operations) || !Array.isArray(draft.questions)) return [{ code: "INVALID_COMMAND", message: "변경 명령 형식이 올바르지 않습니다." }];
  for (const operation of draft.operations) {
    if (!operation || !operationTypes.has(operation.type) || !Array.isArray(operation.targetTodoIds) || !Array.isArray(operation.targetAcademicEventIds)) { errors.push({ code: "INVALID_COMMAND", message: "허용되지 않은 변경 명령입니다." }); continue; }
    if (operation.targetTodoIds.some((id) => !todoIds.has(id))) errors.push({ code: "UNKNOWN_TODO", message: "존재하지 않는 Todo를 참조했습니다." });
    if (operation.targetAcademicEventIds.some((id) => !eventIds.has(id))) errors.push({ code: "UNKNOWN_EVENT", message: "존재하지 않는 AcademicEvent를 참조했습니다." });
    if (operation.targetTodoIds.some((id) => input.completedTodoIds.includes(id))) errors.push({ code: "COMPLETED_TODO", message: "완료된 Todo는 변경할 수 없습니다." });
    if (operation.targetTodoIds.some((id) => operation.targetAcademicEventIds.length > 0 && !operation.targetAcademicEventIds.includes(todoById.get(id)?.sourceAcademicEventId ?? ""))) errors.push({ code: "REFERENCE_MISMATCH", message: "Todo와 AcademicEvent 참조가 일치하지 않습니다." });
    if (operation.scheduledDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(operation.scheduledDate) || operation.scheduledDate < input.planStartDate || operation.scheduledDate > input.planEndDate)) errors.push({ code: "INVALID_DATE", message: "변경 날짜가 계획 범위 밖입니다." });
    if (operation.weekday !== null && (!Number.isInteger(operation.weekday) || operation.weekday < 0 || operation.weekday > 6)) errors.push({ code: "INVALID_WEEKDAY", message: "요일 값이 올바르지 않습니다." });
    if (operation.minutes !== null && (!Number.isInteger(operation.minutes) || operation.minutes < 1 || operation.minutes > 720)) errors.push({ code: "INVALID_MINUTES", message: "학습시간 값이 올바르지 않습니다." });
    if (operation.taskCount !== null && (!Number.isInteger(operation.taskCount) || operation.taskCount < 0 || operation.taskCount > 20)) errors.push({ code: "INVALID_TASK_COUNT", message: "할 일 개수 값이 올바르지 않습니다." });
  }
  return errors;
}

function requestForOperation(operation: AdjustmentOperation, todo: Todo | undefined, requestedAt: string) {
  const title = todo ? `'${todo.title}' ` : "";
  if (operation.type === "rebalance_before_deadline") return `${title}마감일에 맞춰서 다시 조정해`;
  if (operation.type === "rebalance_before_class") return `${title}수업일을 반영해서 재배치해줘`;
  if (operation.type === "move") return `${title}${operation.scheduledDate ?? weekdayLabels[operation.weekday ?? -1] ?? ""}로 옮겨줘`;
  if (operation.type === "split") return `${title}${operation.weekday === null ? "두 날로" : `${weekdayLabels[operation.weekday]}까지`} 나눠줘`;
  if (operation.type === "increase_duration") return `${title}공부시간을 늘려줘`;
  if (operation.type === "decrease_duration") return `${title}공부시간을 줄여줘`;
  if (operation.type === "prioritize") return `${title}먼저 우선 배치해줘`;
  if (operation.type === "set_daily_limit") {
    const hours = Math.max(0.25, (operation.minutes ?? 60) / 60);
    return operation.weekday === null ? `하루 ${hours}시간 이하로 해줘` : `${weekdayLabels[operation.weekday]}에 할 일 ${hours}시간 이하로 해줘`;
  }
  if (operation.type === "set_weekday_task_limit") return `${weekdayLabels[operation.weekday ?? -1]} 할 일 ${operation.taskCount ?? 1}개 이하로 해줘`;
  if (operation.type === "prohibit_weekday") return `${weekdayLabels[operation.weekday ?? -1]}에는 공부하지 않게 해줘`;
  if (operation.type === "lighten_weekday") return `${weekdayLabels[operation.weekday ?? -1]} 할 일을 가볍게 해줘`;
  if (operation.type === "reduce_daily_load") return `${weekdayLabels[new Date(`${requestedAt.slice(0, 10)}T00:00:00Z`).getUTCDay()]} 할 일을 줄여줘`;
  return "";
}

function executeDraft(draft: AdjustmentCommandDraft, base: AdjustPlanInput) {
  let todos = base.todos; const changedIds = new Set<string>(); let lastText = "";
  for (const operation of draft.operations) {
    const target = todos.find((todo) => operation.targetTodoIds.includes(todo.id));
    if (operation.type === "set_duration" && target && operation.minutes) {
      todos = todos.map((todo) => todo.id === target.id ? { ...todo, estimatedDurationMinutes: operation.minutes! } : todo); changedIds.add(target.id); continue;
    }
    if (operation.type === "deprioritize" && target) {
      todos = todos.map((todo) => todo.id === target.id ? { ...todo, priority: "low" } : todo); changedIds.add(target.id); continue;
    }
    const result = adjustPlanDeterministically({ ...base, todos, selectedTodoId: target?.id ?? null, requestText: requestForOperation(operation, target, base.requestedAt) });
    if (!result.changed && /(어려|수 없|찾지 못|적용하지|변경하지)/.test(result.assistantMessage.text)) {
      return { ...result, changedTodoIds: [...changedIds], executionConflict: result.assistantMessage.text };
    }
    todos = result.todos; result.changedTodoIds?.forEach((id) => changedIds.add(id)); lastText = result.assistantMessage.text;
  }
  const text = changedIds.size > 0
    ? `요청을 반영해 주간계획을 조정했어요. ${lastText || "변경이 필요한 할 일만 반영했어요."}`
    : `요청을 확인했어요. ${lastText || "현재 계획에서 변경할 내용을 찾지 못했어요."}`;
  return { operationId: base.operationId, todos, changed: changedIds.size > 0, changedTodoIds: [...changedIds], assistantMessage: { id: `assistant-${base.operationId}`, role: "assistant" as const, text, createdAt: base.requestedAt, status: "sent" as const, intent: "adjust-plan" as const, operationId: base.operationId } };
}

export async function runPlanAdjustment(input: {
  command: GeneratePlanCommand; plan: WeeklyPlan; todos: Todo[]; selectedTodoId: string | null; runner: AdjustmentCommandRunner;
  onStage?: (stage: AdjustmentStage) => void;
}): Promise<PlanAdjustmentResult> {
  const started = nowMs(); input.onStage?.("acknowledged");
  diagnosticLog({ operationId: input.command.operationId, mode: "adjust", stage: "received", receivedAt: new Date().toISOString(), attempt: 0 });
  const base: AdjustPlanInput = { operationId: input.command.operationId, requestedAt: input.command.requestedAt, requestText: input.command.requestText, weeklyPlan: input.plan, todos: input.todos, academicEvents: input.command.extractedItems, calendarEvents: input.command.calendarEvents, maxDailyStudyMinutes: input.command.planningProfile.maxDailyStudyMinutes, selectedTodoId: input.selectedTodoId };
  const parsedAt = nowMs(); const fastDraft = parseFastAdjustmentCommand(input.command.requestText, input.todos, input.selectedTodoId, input.plan.weekStartDate);
  diagnosticLog({ operationId: input.command.operationId, mode: "adjust", stage: "fast-path-decision", elapsedMs: Math.round(nowMs() - parsedAt), fastPath: Boolean(fastDraft), inputChars: input.command.requestText.length });
  let draft = fastDraft; let attempts = 0;
  if (!draft) {
    input.onStage?.("interpreting"); const modelInput = compactInput(input.command, input.plan, input.todos, input.selectedTodoId); let errors: Array<{ code: string; message: string }> = [];
    for (const attempt of [1, 2] as const) {
      attempts = attempt;
      try { draft = await input.runner.execute({ operationId: input.command.operationId, attempt, input: modelInput, validationErrors: errors }); }
      catch (error) {
        const text = error instanceof Error ? error.message : "AI 변경 명령 실행에 실패했어요.";
        diagnosticLog({ operationId: input.command.operationId, mode: "adjust", stage: "complete", totalMs: Math.round(nowMs() - started), fastPath: false, attempt, result: "model-failure" });
        return { todos: input.todos, changed: false, changedTodoIds: [], validationError: text, questions: [], usedFastPath: false, modelAttempts: attempt, resultCode: "model-failure", assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", text: "요청을 처리하는 중 문제가 생겨 주간계획을 변경하지 않았어요. 잠시 후 다시 시도해주세요.", createdAt: input.command.requestedAt, status: "failed", intent: "adjust-plan", operationId: input.command.operationId } };
      }
      if (draft.questions.length) {
        if (asksForMissingAcademicFact(draft.questions[0])) {
          return {
            todos: input.todos,
            changed: false,
            changedTodoIds: [],
            questions: [],
            usedFastPath: false,
            modelAttempts: attempt,
            resultCode: "no-change",
            assistantMessage: missingAcademicFactMessage(input.command.operationId, input.command.requestedAt),
          };
        }
        const question = userFacingClarification(draft.questions[0], input.selectedTodoId);
        return { todos: input.todos, changed: false, changedTodoIds: [], questions: [question], usedFastPath: false, modelAttempts: attempt, resultCode: "question", assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", text: question, createdAt: input.command.requestedAt, status: "sent", intent: "adjust-plan", operationId: input.command.operationId } };
      }
      errors = validateCommandDraft(draft, modelInput);
      if (!errors.length) break;
      draft = null;
    }
    if (!draft) return { todos: input.todos, changed: false, changedTodoIds: [], validationError: "AI가 유효한 변경 대상을 찾지 못했어요.", questions: [], usedFastPath: false, modelAttempts: attempts, resultCode: "conflict", assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", text: "조정할 대상을 확실하게 식별하지 못해 기존 계획을 유지했어요.", createdAt: input.command.requestedAt, status: "failed", intent: "adjust-plan", operationId: input.command.operationId } };
  }
  input.onStage?.("rebalancing"); const executionStarted = nowMs(); const adjusted = executeDraft(draft, base);
  if ("executionConflict" in adjusted && adjusted.executionConflict) {
    const executionMs = Math.round(nowMs() - executionStarted);
    diagnosticLog({ operationId: input.command.operationId, mode: "adjust", stage: "complete", totalMs: Math.round(nowMs() - started), executionMs, validationMs: 0, fastPath: Boolean(fastDraft), attempt: attempts, result: "conflict" });
    return { todos: input.todos, changed: false, changedTodoIds: [], validationError: adjusted.executionConflict, questions: [], usedFastPath: Boolean(fastDraft), modelAttempts: attempts, resultCode: "conflict", assistantMessage: { ...adjusted.assistantMessage, status: "failed", text: `${adjusted.executionConflict} 기존 계획은 그대로 유지했어요.` } };
  }
  input.onStage?.("validating"); const validationStarted = nowMs();
  const changedSources = new Set(input.todos.filter((before) => adjusted.todos.some((after) => after.id === before.id && JSON.stringify(after) !== JSON.stringify(before))).map((todo) => todo.sourceExtractedItemId));
  const constraints = parsePlanConstraints(`${input.plan.generationRequest}. ${input.command.requestText}`);
  const validation = validatePlanConstraints(adjusted.todos, constraints, input.plan, input.command.extractedItems, input.todos, changedSources.size ? changedSources : undefined, input.command.calendarEvents, input.command.planningProfile.maxDailyStudyMinutes ?? null);
  const baselineConstraints = parsePlanConstraints(input.plan.generationRequest);
  const baselineValidation = validatePlanConstraints(input.todos, baselineConstraints, input.plan, input.command.extractedItems, undefined, undefined, input.command.calendarEvents, input.command.planningProfile.maxDailyStudyMinutes ?? null);
  const blockingViolations = validation.violations.filter((violation) => blocksAdjustment(violation, baselineValidation.violations, input.todos, adjusted.todos, adjusted.changedTodoIds ?? []));
  const validationMs = Math.round(nowMs() - validationStarted); const executionMs = Math.round(validationStarted - executionStarted);
  if (blockingViolations.length) {
    const reason = blockingViolations.join(", "); diagnosticLog({ operationId: input.command.operationId, mode: "adjust", stage: "complete", totalMs: Math.round(nowMs() - started), executionMs, validationMs, fastPath: Boolean(fastDraft), attempt: attempts, result: "conflict" });
    return { todos: input.todos, changed: false, changedTodoIds: [], validationError: reason, questions: [], usedFastPath: Boolean(fastDraft), modelAttempts: attempts, resultCode: "conflict", assistantMessage: { id: `assistant-${input.command.operationId}`, role: "assistant", text: `현재 마감과 일정 조건 때문에 요청을 적용하지 않았어요. ${reason}`, createdAt: input.command.requestedAt, status: "failed", intent: "adjust-plan", operationId: input.command.operationId } };
  }
  const changed = adjusted.changed === true && (adjusted.changedTodoIds?.length ?? 0) > 0; diagnosticLog({ operationId: input.command.operationId, mode: "adjust", stage: "complete", totalMs: Math.round(nowMs() - started), executionMs, validationMs, fastPath: Boolean(fastDraft), attempt: attempts, result: changed ? "success" : "no-change" });
  return { todos: changed ? adjusted.todos : input.todos, changed, changedTodoIds: adjusted.changedTodoIds ?? [], questions: [], usedFastPath: Boolean(fastDraft), modelAttempts: attempts, resultCode: changed ? "success" : "no-change", assistantMessage: adjusted.assistantMessage };
}
