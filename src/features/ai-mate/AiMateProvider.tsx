import {
  createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { demoInteractionClock } from "../../application/clock";
import { runAiPlanning } from "../../application/aiPlanOrchestrator";
import { runPlanAdjustment, type AdjustmentStage } from "../../application/planAdjustment";
import {
  selectAllExtractedItems, selectCalendarEvents, selectCurrentWeeklyPlan, selectDocuments, selectIncompleteTodos, selectTodosForCurrentPlan,
} from "../../domain/selectors";
import { validatePlanPrerequisites } from "../../domain/policies";
import { adjustmentUsageDate } from "../../domain/adjustmentUsage";
import type {
  AiMateIntent, AiMateMessage, AiMateMessageAction, ExtractedItem, OperationId, PlanningProfile, PlanPrerequisiteReason, Todo,
} from "../../domain/types";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { classifyAiMateIntent } from "./classifyAiMateIntent";
import { createWeeklyPlanModelRunner } from "./weeklyPlanModelRunner";
import { createAdjustmentCommandRunner } from "./adjustmentCommandRunner";

const INITIAL_MESSAGES: AiMateMessage[] = [
  { id: "catch-introduction", role: "assistant", text: "안녕하세요! 여러분의 AI Mate 캐치예요.", createdAt: demoInteractionClock.now().toISOString(), status: "sent" },
  { id: "catch-plan-guidance", role: "assistant", text: "확인한 학업 일정을 바탕으로 오늘부터 7일 계획을 만들 수 있어요.", createdAt: demoInteractionClock.now().toISOString(), status: "sent" },
];

export const GENERATE_PLAN_DRAFT = "주간계획 생성해줘. 다음의 요청사항을 반영해: ";
export interface AiMatePromptChip {
  label: string;
  draft?: string;
  action?: "explain-selected" | "update-plan" | "undo-auto-update" | "start-add-todo" | "select-add-course";
  courseName?: string;
}
type QuestionKind = "max-daily-study" | "confidence" | "pace" | "preparation" | "exam-goal";
interface PlanningQuestion {
  id: string; kind: QuestionKind; prompt: string; courseName?: string; eventId?: string;
  chips: AiMatePromptChip[];
}
type PendingGeneration =
  | { mode: "generate"; operationId: OperationId; requestText: string; question: PlanningQuestion }
  | { mode: "update"; operationId: OperationId; requestText: string; question: PlanningQuestion; affectedIds: string[] };
interface FailedRequest { operationId: OperationId; text: string; }
interface PendingTodoAddition { courseName: string; title: string | null; }
interface PendingAdjustmentQuestion { requestText: string; selectedTodoId: string | null; question: string; }
interface AdjustmentContinuation { selectedTodoId: string | null; deadlineDate?: string; forceAdjustment?: boolean; }
interface AiMateContextValue {
  isOpen: boolean; setOpen: (open: boolean) => void; openWithDraft: (draft: string, chips?: AiMatePromptChip[]) => void;
  openForTodo: (todoId: string) => void; openDefault: () => void;
  openForPlanGeneration: () => void; messages: AiMateMessage[]; draft: string; setDraft: (draft: string) => void;
  promptChips: AiMatePromptChip[]; selectPromptChip: (chip: AiMatePromptChip) => void; isResponding: boolean;
  responseStage: AdjustmentStage | null;
  adjustmentRemaining: number; sendMessage: (event?: FormEvent) => void; retryFailed: (operationId: OperationId) => void;
  updateCoachmark: string | null;
}

const AiMateContext = createContext<AiMateContextValue | null>(null);
const waitForResponse = () => new Promise<void>((resolve) => window.setTimeout(resolve, 350));
let assistantMessageSequence = 0;
function assistantMessage(operationId: OperationId, text: string, intent: AiMateIntent, actions?: AiMateMessageAction[]): AiMateMessage {
  assistantMessageSequence += 1;
  return { id: `assistant-${operationId}-${Date.now()}-${assistantMessageSequence}`, role: "assistant", text, createdAt: demoInteractionClock.now().toISOString(), status: "sent", intent, operationId, actions };
}
function prerequisiteMessage(operationId: OperationId, reason: PlanPrerequisiteReason) {
  const messages: Record<PlanPrerequisiteReason, { text: string; actions?: AiMateMessageAction[] }> = {
    "not-scheduled": { text: "첫 주간계획은 학업 이벤트 검토 후 바로 만들 수 있어요." },
    "no-upload": { text: "계획을 만들려면 먼저 학업 자료가 필요해요.", actions: [{ label: "Upload로 이동", href: "/upload" }] },
    "calendar-disconnected": { text: "연결된 개인 일정 없이 현재 학업 정보만으로 계획을 만들게요." },
    "needs-review": { text: "확인이 필요한 추출 결과가 있어요. 내용을 확인하고 저장해주세요.", actions: [{ label: "학업 이벤트 확인", href: "/upload/extraction" }] },
    "already-generated": { text: "이미 주간계획이 있어요. 대신 주간계획 수정을 통해 원하는 요구사항을 반영해봐요!" },
  };
  const response = messages[reason];
  return assistantMessage(operationId, response.text, "generate-plan", response.actions);
}

function planningItems(items: ExtractedItem[]) {
  return items.filter((item) => item.confirmationStatus === "confirmed" && item.itemType !== "class-schedule");
}

function adjustmentDraft(todo?: Todo) {
  return todo ? `'${todo.title}' 계획을 다음의 요청사항을 반영해서 조정해줘: ` : "현재 주간계획을 다음의 요청사항을 반영해서 조정해줘: ";
}

function recommendationExplanation(todo: Todo) {
  const details = todo.recommendationDetails;
  if (!details) return `'${todo.title}'을 추천한 이유는 다음과 같습니다: ${todo.recommendationReason} 예상 소요시간은 ${todo.estimatedDurationMinutes}분이며, ${todo.durationRationale.join(", ") || "현재 학업 정보"}를 근거로 산정했어요.`;
  const reasons = [...details.needReasons, ...details.placementReasons, ...details.priorityReasons, ...details.durationReasons, ...details.personalizationReasons, ...details.userRequestReasons];
  return `'${todo.title}'을 추천한 이유는 다음과 같습니다:\n${[...new Set(reasons)].map((reason) => `• ${reason}`).join("\n")}`;
}

function adjustmentRequest(text: string) {
  const marker = "요청사항을 반영해서 조정해줘:";
  const index = text.indexOf(marker);
  return index < 0 ? text.trim() : text.slice(index + marker.length).trim();
}

function participatesInPlanning(todo: Todo) {
  return todo.planningParticipation !== "calendar-only";
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function resolveTodoAdditionDate(answer: string, weekStartDate: string, weekEndDate: string) {
  const exact = answer.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (exact && !Number.isNaN(new Date(`${exact}T00:00:00Z`).getTime())) {
    return exact >= weekStartDate && exact <= weekEndDate ? exact : null;
  }
  const monthDay = answer.match(/(\d{1,2})\s*(?:월|\/)\s*(\d{1,2})\s*(?:일)?/);
  if (monthDay) {
    const candidate = `${weekStartDate.slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
    if (!Number.isNaN(new Date(`${candidate}T00:00:00Z`).getTime()) && candidate >= weekStartDate && candidate <= weekEndDate) return candidate;
  }
  const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const normalizedAnswer = answer.trim();
  const weekday = weekdayNames.findIndex((name) => normalizedAnswer.includes(name) || normalizedAnswer === name[0]);
  if (weekday >= 0) {
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = addDays(weekStartDate, offset);
      if (new Date(`${candidate}T00:00:00Z`).getUTCDay() === weekday) return candidate;
    }
  }
  return null;
}

function resolveAdjustmentDateAnswer(answer: string, referenceDate: string) {
  const exact = answer.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const monthDay = answer.match(/(\d{1,2})\s*(?:월|\/)\s*(\d{1,2})\s*(?:일)?/);
  const candidate = exact ?? (monthDay
    ? `${referenceDate.slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`
    : null);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate ? null : candidate;
}

function inferAddedTodoType(title: string): Todo["todoType"] {
  if (/(복습|정리)/.test(title)) return "review";
  if (/(준비|예습|읽기|확인)/.test(title)) return "class-prep";
  return "assignment-work";
}

function latestAutomaticAdjustment(state: ReturnType<typeof usePrototypeStore>["state"]) {
  return Object.values(state.planAdjustmentsById)
    .filter((adjustment) => adjustment.trigger === "NEW_ACADEMIC_INFORMATION" && !adjustment.undoneAt)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function personalizationCandidatesForUpdate(items: ExtractedItem[], recommendation: ReturnType<typeof usePrototypeStore>["state"]["pendingPlanUpdate"]) {
  if (!recommendation) return [];
  const previousById = new Map((recommendation.previousAcademicEvents ?? []).map((item) => [item.id, item]));
  return items.filter((item) => item.confirmationStatus === "confirmed" && (
    !previousById.has(item.id) || previousById.get(item.id)?.confirmationStatus !== "confirmed"
  ));
}

export function selectNextPlanningQuestion(items: ExtractedItem[], profile: PlanningProfile): PlanningQuestion | null {
  const candidates = planningItems(items);
  const confidenceItem = candidates.find((item) => item.estimatedDurationMinutes === null && !profile.confidenceByCourse[item.courseName]);
  if (confidenceItem) return {
    id: `confidence-${confidenceItem.courseName}`, kind: "confidence", courseName: confidenceItem.courseName,
    prompt: `${confidenceItem.courseName} 과목은 어느 정도 자신 있는 편인가요?`,
    chips: [{ label: "자신 없음", draft: "자신감 낮음" }, { label: "보통", draft: "자신감 보통" }, { label: "자신 있음", draft: "자신감 높음" }],
  };
  if (candidates.some((item) => item.estimatedDurationMinutes === null) && !profile.pace) return {
    id: "pace", kind: "pace", prompt: "비슷한 학업 작업을 처리하는 속도는 보통 어느 정도인가요?",
    chips: [{ label: "여유 있게", draft: "작업 속도 느림" }, { label: "보통", draft: "작업 속도 보통" }, { label: "빠르게", draft: "작업 속도 빠름" }],
  };
  const preparationItem = candidates.find((item) => item.difficulty === "high" && !profile.preparationByEventId[item.id]);
  if (preparationItem) return {
    id: `preparation-${preparationItem.id}`, kind: "preparation", eventId: preparationItem.id,
    prompt: `${preparationItem.title}은 바로 시작할 수 있나요, 아니면 관련 개념 복습이 필요한가요?`,
    chips: [{ label: "바로 시작", draft: "바로 시작 가능" }, { label: "일부 복습", draft: "관련 개념 일부 복습 필요" }, { label: "기초부터", draft: "기초부터 다시 학습 필요" }],
  };
  const exam = candidates.find((item) => (item.itemType === "exam" || item.itemType === "quiz") && !profile.examGoalByEventId[item.id]);
  if (exam) return {
    id: `exam-goal-${exam.id}`, kind: "exam-goal", eventId: exam.id, prompt: `${exam.title}에서 목표하는 수준은 어느 정도인가요?`,
    chips: ["Pass", "C 수준", "B 수준", "A 수준"].map((label) => ({ label, draft: label })),
  };
  return null;
}

export function selectGenerationPlanningQuestion(items: ExtractedItem[], profile: PlanningProfile): PlanningQuestion | null {
  if (!profile.maxDailyStudyMinutes) return {
    id: "max-daily-study", kind: "max-daily-study",
    prompt: "할 일이 많은 날에는 하루에 최대 몇 시간 정도까지 공부하거나 과제를 할 수 있나요?",
    chips: [
      { label: "2-4시간", draft: "2-4시간" },
      { label: "4-6시간", draft: "4-6시간" },
      { label: "6-8시간", draft: "6-8시간" },
      { label: "그 이상", draft: "8시간 이상" },
    ],
  };
  return null;
}

export function parseMaxDailyStudyMinutes(answer: string): number | null {
  const range = answer.match(/(\d+(?:\.\d+)?)\s*(?:-|~|–|—|부터)\s*(\d+(?:\.\d+)?)\s*시간/);
  if (range) {
    const lowerHours = Number(range[1]);
    const upperHours = Number(range[2]);
    if (Number.isFinite(lowerHours) && Number.isFinite(upperHours) && lowerHours < upperHours) {
      const midpointMinutes = ((lowerHours + upperHours) / 2) * 60;
      return midpointMinutes >= 30 && midpointMinutes <= 720 ? Math.round(midpointMinutes / 15) * 15 : null;
    }
  }

  const atLeast = answer.match(/(\d+(?:\.\d+)?)\s*시간\s*(?:이상|초과)/);
  if (atLeast) {
    const conservativeMinutes = (Number(atLeast[1]) + 1) * 60;
    return conservativeMinutes >= 30 && conservativeMinutes <= 720 ? Math.round(conservativeMinutes / 15) * 15 : null;
  }

  const hours = answer.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minutes = answer.match(/(\d+)\s*분/);
  const value = hours ? Number(hours[1]) * 60 : minutes ? Number(minutes[1]) : Number.NaN;
  return Number.isFinite(value) && value >= 30 && value <= 720 ? Math.round(value / 15) * 15 : null;
}

function applyQuestionAnswer(profile: PlanningProfile, question: PlanningQuestion, answer: string): PlanningProfile | null {
  if (question.kind === "max-daily-study") {
    const value = parseMaxDailyStudyMinutes(answer);
    return value === null ? null : { ...profile, maxDailyStudyMinutes: value };
  }
  if (question.kind === "confidence" && question.courseName) return { ...profile, confidenceByCourse: { ...profile.confidenceByCourse, [question.courseName]: /높|있/.test(answer) ? "high" : /낮|없/.test(answer) ? "low" : "medium" } };
  if (question.kind === "pace") return { ...profile, pace: /빠/.test(answer) ? "fast" : /느|여유/.test(answer) ? "slow" : "average" };
  if (question.kind === "preparation" && question.eventId) return { ...profile, preparationByEventId: { ...profile.preparationByEventId, [question.eventId]: /기초|다시/.test(answer) ? "restart-needed" : /복습/.test(answer) ? "review-needed" : "ready" } };
  if (question.kind === "exam-goal" && question.eventId) return { ...profile, examGoalByEventId: { ...profile.examGoalByEventId, [question.eventId]: /^A/i.test(answer) ? "a" : /^B/i.test(answer) ? "b" : /^C/i.test(answer) ? "c" : "pass" } };
  return profile;
}

function invalidQuestionAnswerMessage(question: PlanningQuestion) {
  if (question.kind === "max-daily-study") {
    return "이해하지 못했어요. 2-4시간처럼 범위를 선택하거나, 하루에 가능한 최대 시간을 알려주세요.";
  }
  return "답변을 이해하지 못했어요. 선택지 중 하나를 고르거나 다시 입력해주세요.";
}

export function AiMateProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = usePrototypeStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMateMessage[]>(() => INITIAL_MESSAGES.map((message) => ({ ...message })));
  const [draft, setDraft] = useState("");
  const [promptChips, setPromptChips] = useState<AiMatePromptChip[]>([]);
  const [isResponding, setResponding] = useState(false);
  const [responseStage, setResponseStage] = useState<AdjustmentStage | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [pendingTodoAddition, setPendingTodoAddition] = useState<PendingTodoAddition | null>(null);
  const [pendingAdjustmentQuestion, setPendingAdjustmentQuestion] = useState<PendingAdjustmentQuestion | null>(null);
  const [failedRequest, setFailedRequest] = useState<FailedRequest | null>(null);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const operationSequence = useRef(0);
  const automaticRunRef = useRef<string | undefined>(undefined);
  const questionRunRef = useRef<string | undefined>(undefined);
  const noticeMessageRef = useRef<string | undefined>(undefined);
  const processedUpdateRef = useRef(new Set<string>());
  const stateRef = useRef(state); stateRef.current = state;
  const appendAssistant = useCallback((message: AiMateMessage) => setMessages((current) => [...current, message]), []);
  const taskChips = useCallback((todo?: Todo, includeUpdate = true) => {
    const managedTodo = todo && participatesInPlanning(todo) ? todo : undefined;
    const chips: AiMatePromptChip[] = [];
    if (!todo || managedTodo) chips.push({ label: "주간계획 수정", draft: adjustmentDraft(managedTodo) });
    chips.push({ label: "주간계획 추가", action: "start-add-todo" });
    if (managedTodo) chips.push({ label: "할 일 추천이유", action: "explain-selected" });
    const automatic = latestAutomaticAdjustment(stateRef.current);
    if (includeUpdate && automatic) chips.push({ label: "아냐, 취소해줘", action: "undo-auto-update" });
    return chips;
  }, []);
  const setOpen = useCallback((open: boolean) => { setIsOpen(open); if (!open) { setPromptChips([]); setSelectedTodoId(null); setPendingTodoAddition(null); setPendingAdjustmentQuestion(null); } }, []);
  const openWithDraft = useCallback((nextDraft: string, chips: AiMatePromptChip[] = []) => { setPendingTodoAddition(null); setPendingAdjustmentQuestion(null); setDraft(nextDraft); setPromptChips(chips); setIsOpen(true); }, []);
  const openForPlanGeneration = useCallback(() => openWithDraft("", [{ label: "주간계획 생성", draft: GENERATE_PLAN_DRAFT }]), [openWithDraft]);
  const openForTodo = useCallback((todoId: string) => {
    const todo = stateRef.current.todosById[todoId];
    if (!todo) return;
    setPendingTodoAddition(null); setPendingAdjustmentQuestion(null); setSelectedTodoId(todoId); setDraft(""); setPromptChips(taskChips(todo)); setIsOpen(true);
  }, [taskChips]);
  const openDefault = useCallback(() => {
    const current = stateRef.current;
    if (!selectCurrentWeeklyPlan(current)) { openForPlanGeneration(); return; }
    setPendingTodoAddition(null); setPendingAdjustmentQuestion(null); setSelectedTodoId(null); setDraft(""); setPromptChips(taskChips()); setIsOpen(true);
  }, [openForPlanGeneration, taskChips]);

  const generatePlan = useCallback(async (operationId: string, requestText: string, profile: PlanningProfile) => {
    const current = stateRef.current;
    const planningQuestion = selectGenerationPlanningQuestion(selectAllExtractedItems(current), profile);
    if (planningQuestion) {
      setPendingGeneration({ mode: "generate", operationId, requestText, question: planningQuestion });
      setPromptChips(planningQuestion.chips);
      appendAssistant(assistantMessage(operationId, planningQuestion.prompt, "generate-plan"));
      return;
    }
    setPendingGeneration(null); setPromptChips([]);
    const command = { operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText, user: current.user,
      documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), calendarEvents: selectCalendarEvents(current),
      existingWeeklyPlan: selectCurrentWeeklyPlan(current), existingIncompleteTodos: selectIncompleteTodos(current).filter(participatesInPlanning), planningProfile: profile };
    const result = await runAiPlanning({ mode: "generate", command, runner: createWeeklyPlanModelRunner({ command }) });
    if (!result.validationError && result.questions.length === 0) dispatch({ type: "plan/applied", payload: result });
    appendAssistant(result.assistantMessage);
  }, [appendAssistant, dispatch]);

  const updatePlanOrAsk = useCallback(async (operationId: string, affectedIds: string[], profile: PlanningProfile) => {
    const current = stateRef.current;
    const recommendation = current.pendingPlanUpdate;
    const plan = selectCurrentWeeklyPlan(current);
    if (!recommendation || !plan) {
      if (!operationId.startsWith("ai-auto-") && !operationId.startsWith("ai-question-")) appendAssistant(assistantMessage(operationId, "현재 반영할 새로운 학업 정보가 없어요.", "update-plan"));
      return;
    }
    if (processedUpdateRef.current.has(recommendation.id)) return;
    const allCurrentTodos = selectTodosForCurrentPlan(current);
    const currentTodos = allCurrentTodos.filter(participatesInPlanning);
    const calendarOnlyTodos = allCurrentTodos.filter((todo) => !participatesInPlanning(todo));
    const affectedItems = selectAllExtractedItems(current).filter((item) => affectedIds.includes(item.id));
    const question = selectNextPlanningQuestion(personalizationCandidatesForUpdate(affectedItems, recommendation), profile);
    if (question) {
      setPendingGeneration({ mode: "update", operationId, requestText: plan.generationRequest, question, affectedIds });
      setPromptChips(question.chips);
      appendAssistant(assistantMessage(operationId, question.prompt, "update-plan"));
      return;
    }
    setPendingGeneration(null);
    const usageDate = adjustmentUsageDate();
    if ((current.adjustmentUsageByDate[usageDate] ?? 0) >= 10) {
      appendAssistant(assistantMessage(operationId, "오늘 가능한 주간계획 조정 10회를 모두 사용했어요. 내일부터 다시 계획을 조정할 수 있어요.", "update-plan"));
      return;
    }
    const command = { operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText: plan.generationRequest, user: current.user, documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), calendarEvents: selectCalendarEvents(current), existingWeeklyPlan: plan, existingIncompleteTodos: selectIncompleteTodos(current).filter(participatesInPlanning), planningProfile: profile };
    const result = await runAiPlanning({ mode: "update", command, currentPlan: plan, currentTodos, affectedAcademicEventIds: affectedIds, previousAcademicEvents: recommendation.previousAcademicEvents, runner: createWeeklyPlanModelRunner({ command, plan, todos: currentTodos, affectedIds, previousEvents: recommendation.previousAcademicEvents }) });
    if (result.validationError || result.questions.length > 0) {
      if (!operationId.startsWith("ai-auto-")) appendAssistant(result.assistantMessage);
      return;
    }
    processedUpdateRef.current.add(recommendation.id);
    if (result.changed) {
      dispatch({ type: "plan/adjusted", payload: { operationId, todos: [...result.todos, ...calendarOnlyTodos], usageDate, changed: true, trigger: "NEW_ACADEMIC_INFORMATION", requestText: null, relatedAcademicEventIds: affectedIds, changedTodoIds: result.changedTodoIds ?? [], summary: result.assistantMessage.text, diff: result.planDiff } });
      if (!operationId.startsWith("ai-auto-")) {
        dispatch({ type: "plan/adjustmentNoticeReviewed", payload: { adjustmentId: `adjustment-${operationId}` } });
      }
    } else {
      dispatch({ type: "plan/updateProcessed", payload: { outcome: "no-change" } });
    }
    if (!operationId.startsWith("ai-auto-")) {
      appendAssistant(result.assistantMessage);
      setPromptChips(result.changed
        ? [...taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined, false), { label: "아냐, 취소해줘", action: "undo-auto-update" }]
        : taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined));
    } else {
      setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined));
    }
  }, [appendAssistant, dispatch, selectedTodoId, taskChips]);

  useEffect(() => {
    // A question answer owns the update flow until its delayed continuation finishes.
    // Running the background updater here would consume the same recommendation
    // without a visible response and make the question flow return silently.
    if (pendingGeneration || isResponding) return;
    const recommendation = state.pendingPlanUpdate;
    const plan = selectCurrentWeeklyPlan(state);
    if (!recommendation || !plan) return;
    const affectedItems = selectAllExtractedItems(state).filter((item) => recommendation.academicEventIds.includes(item.id));
    if (selectNextPlanningQuestion(personalizationCandidatesForUpdate(affectedItems, recommendation), state.planningProfile)) return;
    const usageDate = adjustmentUsageDate();
    if ((state.adjustmentUsageByDate[usageDate] ?? 0) >= 10) return;
    if (automaticRunRef.current === recommendation.id) return;
    automaticRunRef.current = recommendation.id;
    operationSequence.current += 1;
    void updatePlanOrAsk(`ai-auto-${operationSequence.current}`, recommendation.academicEventIds, state.planningProfile);
  }, [isResponding, pendingGeneration, state, updatePlanOrAsk]);

  useEffect(() => {
    if (!isOpen) return;
    const recommendation = state.pendingPlanUpdate;
    const plan = selectCurrentWeeklyPlan(state);
    if (recommendation && plan) {
      const usageDate = adjustmentUsageDate();
      if ((state.adjustmentUsageByDate[usageDate] ?? 0) >= 10) {
        if (noticeMessageRef.current !== recommendation.id) {
          noticeMessageRef.current = recommendation.id;
          appendAssistant(assistantMessage(`limit-${recommendation.id}`, "오늘 가능한 조정횟수를 넘었어요 😓 새로운 학업정보를 바탕으로 내일 주간계획을 업데이트할게요!", "update-plan"));
          dispatch({ type: "plan/updateNoticeReviewed", payload: {} });
        }
        return;
      }
      const affectedItems = selectAllExtractedItems(state).filter((item) => recommendation.academicEventIds.includes(item.id));
      const question = selectNextPlanningQuestion(personalizationCandidatesForUpdate(affectedItems, recommendation), state.planningProfile);
      if (question && !pendingGeneration && questionRunRef.current !== recommendation.id) {
        questionRunRef.current = recommendation.id;
        appendAssistant(assistantMessage(`intro-${recommendation.id}`, "새로 확정된 학업 이벤트를 주간계획에 반영하기 전에 몇 가지 질문이 있어요!", "update-plan"));
        operationSequence.current += 1;
        void updatePlanOrAsk(`ai-question-${operationSequence.current}`, recommendation.academicEventIds, state.planningProfile);
      }
    }
    const automatic = latestAutomaticAdjustment(state);
    if (automatic?.noticeStatus === "unread" && noticeMessageRef.current !== automatic.id) {
      noticeMessageRef.current = automatic.id;
      if (automatic.summary) appendAssistant(assistantMessage(`notice-${automatic.id}`, automatic.summary, "update-plan"));
      dispatch({ type: "plan/adjustmentNoticeReviewed", payload: { adjustmentId: automatic.id } });
      setPromptChips(taskChips(selectedTodoId ? state.todosById[selectedTodoId] : undefined));
    }
  }, [appendAssistant, dispatch, isOpen, pendingGeneration, selectedTodoId, state, taskChips, updatePlanOrAsk]);

  const execute = useCallback(async (text: string, operationId: OperationId, continuation?: AdjustmentContinuation) => {
    const intent = continuation?.forceAdjustment ? "adjust-plan" : classifyAiMateIntent(text); setResponding(true); setFailedRequest(null);
    try {
      if (intent !== "adjust-plan") await waitForResponse();
      if (/오류 테스트/.test(text)) throw new Error("test");
      const current = stateRef.current;
      if (intent === "generate-plan") {
        appendAssistant(assistantMessage(operationId, "주간계획을 생성하는 중입니다...", intent));
        const prerequisite = validatePlanPrerequisites({ user: current.user, documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), existingWeeklyPlan: selectCurrentWeeklyPlan(current), now: demoInteractionClock.now() });
        if (!prerequisite.ok) { appendAssistant(prerequisiteMessage(operationId, prerequisite.reason)); return; }
        await generatePlan(operationId, text, current.planningProfile);
        return;
      }
      if (intent === "explain") {
        const todo = selectedTodoId ? current.todosById[selectedTodoId] : selectTodosForCurrentPlan(current)[0];
        appendAssistant(assistantMessage(operationId, todo ? recommendationExplanation(todo) : "아직 생성된 계획이 없어요.", intent));
        setPromptChips(taskChips(todo));
        return;
      }
      if (intent === "adjust-plan") {
        const plan = selectCurrentWeeklyPlan(current);
        const allTodos = selectTodosForCurrentPlan(current);
        const todos = allTodos.filter(participatesInPlanning);
        const calendarOnlyTodos = allTodos.filter((todo) => !participatesInPlanning(todo));
        const effectiveSelectedTodoId = continuation ? continuation.selectedTodoId : selectedTodoId;
        const request = adjustmentRequest(text);
        if (!plan) { appendAssistant(assistantMessage(operationId, "먼저 주간계획을 생성해주세요.", intent)); return; }
        if (!request) {
          appendAssistant(assistantMessage(operationId, "요청사항이 입력되지 않았습니다. 수정을 원하는 사항을 입력해주세요.", intent));
          setPromptChips(taskChips(effectiveSelectedTodoId ? current.todosById[effectiveSelectedTodoId] : undefined));
          return;
        }
        const usageDate = adjustmentUsageDate();
        if ((current.adjustmentUsageByDate[usageDate] ?? 0) >= 10) {
          appendAssistant(assistantMessage(operationId, "오늘 가능한 주간계획 조정 10회를 모두 사용했어요. 내일부터 다시 계획을 조정할 수 있어요.", intent));
          setPromptChips(taskChips(effectiveSelectedTodoId ? current.todosById[effectiveSelectedTodoId] : undefined));
          return;
        }
        if (/(시험일|제출일|마감일|발표일|퀴즈 날짜).*(바꿔|옮겨|미뤄)/.test(request)) {
          appendAssistant(assistantMessage(operationId, "원본 시험일이나 마감일은 바꿀 수 없어요. 대신 그 일정에 맞춘 학습 계획을 어떻게 조정할지 알려주세요.", intent));
          return;
        }
        const targetSourceId = effectiveSelectedTodoId ? current.todosById[effectiveSelectedTodoId]?.sourceExtractedItemId : null;
        const extractedItems = selectAllExtractedItems(current).map((item) => continuation?.deadlineDate && item.id === targetSourceId
          ? { ...item, date: continuation.deadlineDate, confirmationStatus: "confirmed" as const }
          : item);
        const command = { operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText: text, user: current.user, documents: [], extractedItems, calendarEvents: selectCalendarEvents(current), existingWeeklyPlan: plan, existingIncompleteTodos: [], planningProfile: current.planningProfile };
        const result = await runPlanAdjustment({ command, plan, todos, selectedTodoId: effectiveSelectedTodoId, runner: createAdjustmentCommandRunner(), onStage: setResponseStage });
        if (result.questions.length > 0) {
          const quotedTitle = text.match(/['"]([^'"]+)['"]/)?.[1]?.trim();
          const quotedCandidates = quotedTitle ? todos.filter((todo) => todo.title === quotedTitle) : [];
          const questionTodoId = effectiveSelectedTodoId ?? (quotedCandidates.length === 1 ? quotedCandidates[0].id : null);
          setPendingAdjustmentQuestion({ requestText: text, selectedTodoId: questionTodoId, question: result.questions[0] });
          appendAssistant(result.assistantMessage);
          setPromptChips([]);
          return;
        }
        setPendingAdjustmentQuestion(null);
        if (result.validationError) {
          appendAssistant(result.assistantMessage); setPromptChips(taskChips(effectiveSelectedTodoId ? current.todosById[effectiveSelectedTodoId] : undefined)); return;
        }
        if (result.changed) dispatch({ type: "plan/adjusted", payload: { operationId, todos: [...result.todos, ...calendarOnlyTodos], usageDate, changed: true, trigger: "USER_REQUEST", requestText: request, relatedAcademicEventIds: [...new Set(result.todos.filter((todo) => result.changedTodoIds?.includes(todo.id)).map((todo) => todo.sourceExtractedItemId))], changedTodoIds: result.changedTodoIds ?? [] } });
        appendAssistant(result.assistantMessage); setPromptChips(taskChips(effectiveSelectedTodoId ? current.todosById[effectiveSelectedTodoId] : undefined)); return;
      }
      if (intent === "update-plan") {
        const plan = selectCurrentWeeklyPlan(current);
        const recommendation = current.pendingPlanUpdate;
        if (!plan || !recommendation) { appendAssistant(assistantMessage(operationId, "현재 반영할 새로운 학업 정보가 없어요.", intent)); return; }
        const usageDate = adjustmentUsageDate();
        if ((current.adjustmentUsageByDate[usageDate] ?? 0) >= 10) { appendAssistant(assistantMessage(operationId, "오늘 가능한 주간계획 조정 10회를 모두 사용했어요. 내일부터 다시 계획을 조정할 수 있어요.", intent)); return; }
        const affectedIds = recommendation.academicEventIds.length
          ? recommendation.academicEventIds.filter((id) => Boolean(current.extractedItemsById[id]))
          : [...new Set(selectTodosForCurrentPlan(current).filter((todo) => !todo.isCompleted && participatesInPlanning(todo)).map((todo) => todo.sourceExtractedItemId))];
        await updatePlanOrAsk(operationId, affectedIds, current.planningProfile);
        return;
      }
      if (intent === "undo-update") {
        const automatic = latestAutomaticAdjustment(current);
        if (!automatic) { appendAssistant(assistantMessage(operationId, "취소할 최근 자동 주간계획 조정이 없어요.", intent)); return; }
        dispatch({ type: "plan/automaticUpdateUndone", payload: { adjustmentId: automatic.id } });
        appendAssistant(assistantMessage(operationId, "가장 최근 자동 조정 전 주간계획으로 되돌렸어요. 새 학업 정보나 개인 일정 자체는 그대로 유지했어요.", intent));
        setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined, false));
        return;
      }
      appendAssistant(assistantMessage(operationId, "해당 요청을 이해하지 못했어요. 캐치에겐 주간계획 생성, 주간계획 수정, 할 일 추천이유, 자동 업데이트 취소만 요청할 수 있어요.", intent));
    } catch {
      const failed = assistantMessage(operationId, "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.", intent, [{ label: "다시 시도", action: "retry" }]);
      failed.status = "failed"; appendAssistant(failed); setFailedRequest({ operationId, text });
    } finally { setResponding(false); setResponseStage(null); }
  }, [appendAssistant, dispatch, generatePlan, selectedTodoId, taskChips, updatePlanOrAsk]);

  const selectPromptChip = useCallback((chip: AiMatePromptChip) => {
    if (chip.action === "start-add-todo") {
      const courseNames = [...new Set(selectAllExtractedItems(stateRef.current).map((item) => item.courseName.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "ko"));
      setPendingTodoAddition(null);
      setDraft("");
      if (!courseNames.length) {
        appendAssistant(assistantMessage(`add-course-${Date.now()}`, "먼저 과목이 포함된 학업 자료를 업로드해주세요.", "unknown", [{ label: "Upload로 이동", href: "/upload" }]));
        setPromptChips(taskChips());
        return;
      }
      appendAssistant(assistantMessage(`add-course-${Date.now()}`, "어느 과목의 할 일을 추가할까요?", "unknown"));
      setPromptChips(courseNames.map((courseName) => ({ label: courseName, action: "select-add-course", courseName })));
      return;
    }
    if (chip.action === "select-add-course" && chip.courseName) {
      setPendingTodoAddition({ courseName: chip.courseName, title: null });
      setPromptChips([]);
      setDraft(`[${chip.courseName}] 과목에 대한 할 일을 다음의 제목을 바탕으로 추가해줘: `);
      return;
    }
    if (chip.action === "explain-selected") {
      operationSequence.current += 1;
      void execute("할 일 추천이유를 알려줘", `ai-operation-${operationSequence.current}`);
      return;
    }
    if (chip.action === "update-plan") {
      operationSequence.current += 1;
      void execute("주간계획 업데이트", `ai-operation-${operationSequence.current}`);
      return;
    }
    if (chip.action === "undo-auto-update") {
      operationSequence.current += 1;
      void execute("아냐, 취소해줘", `ai-operation-${operationSequence.current}`);
      return;
    }
    setDraft(chip.draft ?? "");
  }, [appendAssistant, execute, taskChips]);

  const sendMessage = useCallback((event?: FormEvent) => {
    event?.preventDefault(); const text = draft.trim(); if (!text || isResponding) return;
    operationSequence.current += 1; const newOperationId = `ai-operation-${operationSequence.current}`;
    setMessages((current) => [...current, { id: `user-${newOperationId}`, role: "user", text, createdAt: demoInteractionClock.now().toISOString(), status: "sent", intent: pendingAdjustmentQuestion ? "adjust-plan" : pendingGeneration?.mode === "update" ? "update-plan" : pendingGeneration?.mode === "generate" ? "generate-plan" : classifyAiMateIntent(text), operationId: newOperationId }]);
    setDraft(""); setPromptChips([]);
    if (pendingTodoAddition) {
      const intent: AiMateIntent = "unknown";
      if (!pendingTodoAddition.title) {
        const marker = "과목에 대한 할 일을 다음의 제목을 바탕으로 추가해줘:";
        const markerIndex = text.indexOf(marker);
        const title = (markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text).trim();
        if (!title) {
          appendAssistant(assistantMessage(newOperationId, "추가할 할 일의 제목을 입력해주세요.", intent));
          setDraft(`[${pendingTodoAddition.courseName}] ${marker} `);
          return;
        }
        setPendingTodoAddition({ ...pendingTodoAddition, title });
        appendAssistant(assistantMessage(newOperationId, "언제로 추가할까요? 날짜나 요일을 알려주세요.", intent));
        return;
      }
      const current = stateRef.current;
      const plan = selectCurrentWeeklyPlan(current);
      if (!plan) {
        appendAssistant(assistantMessage(newOperationId, "먼저 주간계획을 생성해주세요.", intent));
        setPendingTodoAddition(null);
        return;
      }
      const scheduledDate = resolveTodoAdditionDate(text, plan.weekStartDate, plan.weekEndDate);
      if (!scheduledDate) {
        appendAssistant(assistantMessage(newOperationId, `${plan.weekStartDate}부터 ${plan.weekEndDate} 사이의 날짜나 요일을 알려주세요.`, intent));
        return;
      }
      const newTodo: Todo = {
        id: `calendar-todo-${newOperationId}`,
        weeklyPlanId: plan.id,
        sourceExtractedItemId: `calendar-only:${encodeURIComponent(pendingTodoAddition.courseName)}`,
        scheduledDate,
        startTime: null,
        title: pendingTodoAddition.title,
        todoType: inferAddedTodoType(pendingTodoAddition.title),
        courseName: pendingTodoAddition.courseName,
        estimatedDurationMinutes: 0,
        priority: "medium",
        isCompleted: false,
        recommendationReason: "사용자가 직접 추가한 할 일이에요.",
        durationRationale: [],
        carriedOverFromTodoId: null,
        dependsOnTodoId: null,
        planningParticipation: "calendar-only",
      };
      const todos = [...selectTodosForCurrentPlan(current), newTodo];
      dispatch({ type: "plan/applied", payload: { operationId: newOperationId, weeklyPlan: plan, todos, assistantMessage: assistantMessage(newOperationId, "", intent) } });
      appendAssistant(assistantMessage(newOperationId, `${Number(scheduledDate.slice(5, 7))}월 ${Number(scheduledDate.slice(8, 10))}일에 '${newTodo.title}' 할 일을 추가했어요.`, intent));
      setPendingTodoAddition(null);
      setPromptChips(taskChips());
      return;
    }
    if (pendingAdjustmentQuestion) {
      const current = stateRef.current;
      const plan = selectCurrentWeeklyPlan(current);
      if (!plan) {
        setPendingAdjustmentQuestion(null);
        appendAssistant(assistantMessage(newOperationId, "먼저 주간계획을 생성해주세요.", "adjust-plan"));
        return;
      }
      const asksForDeadline = /마감일|제출일/.test(pendingAdjustmentQuestion.question);
      if (asksForDeadline) {
        const deadlineDate = resolveAdjustmentDateAnswer(text, plan.weekStartDate);
        if (!deadlineDate) {
          appendAssistant(assistantMessage(newOperationId, "날짜를 이해하지 못했어요. 8/21일 또는 2026-08-21처럼 알려주세요.", "adjust-plan"));
          return;
        }
        const target = pendingAdjustmentQuestion.selectedTodoId ? current.todosById[pendingAdjustmentQuestion.selectedTodoId] : undefined;
        const canonicalRequest = `${target ? `'${target.title}' ` : ""}계획을 마감일에 맞춰서 다시 조정해`;
        const continuation = { selectedTodoId: pendingAdjustmentQuestion.selectedTodoId, deadlineDate, forceAdjustment: true };
        setPendingAdjustmentQuestion(null);
        void execute(canonicalRequest, newOperationId, continuation);
        return;
      }
      const contextualRequest = `${pendingAdjustmentQuestion.requestText}\n캐치의 확인 질문: ${pendingAdjustmentQuestion.question}\n사용자 답변: ${text}`;
      const continuation = { selectedTodoId: pendingAdjustmentQuestion.selectedTodoId, forceAdjustment: true };
      setPendingAdjustmentQuestion(null);
      void execute(contextualRequest, newOperationId, continuation);
      return;
    }
    if (pendingGeneration) {
      const nextProfile = applyQuestionAnswer(stateRef.current.planningProfile, pendingGeneration.question, text);
      if (!nextProfile) {
        appendAssistant(assistantMessage(
          newOperationId,
          invalidQuestionAnswerMessage(pendingGeneration.question),
          pendingGeneration.mode === "update" ? "update-plan" : "generate-plan",
        ));
        setPromptChips(pendingGeneration.question.chips);
        return;
      }
      dispatch({ type: "planning/profileUpdated", payload: nextProfile });
      appendAssistant(assistantMessage(
        newOperationId,
        pendingGeneration.mode === "update"
          ? "알겠어요! 답변을 저장했어요. 주간계획에 반영할 내용을 이어서 확인할게요."
          : "알겠어요! 답변을 저장했어요. 주간계획 생성을 이어갈게요.",
        pendingGeneration.mode === "update" ? "update-plan" : "generate-plan",
      ));
      setResponding(true);
      const continuePendingFlow = pendingGeneration.mode === "generate"
        ? () => generatePlan(pendingGeneration.operationId, pendingGeneration.requestText, nextProfile)
        : () => updatePlanOrAsk(pendingGeneration.operationId, pendingGeneration.affectedIds, nextProfile);
      void waitForResponse().then(continuePendingFlow).finally(() => setResponding(false));
      return;
    }
    void execute(text, newOperationId);
  }, [appendAssistant, dispatch, draft, execute, generatePlan, isResponding, pendingAdjustmentQuestion, pendingGeneration, pendingTodoAddition, taskChips, updatePlanOrAsk]);

  const retryFailed = useCallback((operationId: OperationId) => { if (!isResponding && failedRequest?.operationId === operationId) void execute(failedRequest.text, operationId); }, [execute, failedRequest, isResponding]);
  const adjustmentRemaining = Math.max(0, 10 - (state.adjustmentUsageByDate[adjustmentUsageDate()] ?? 0));
  const updateCoachmark = (() => {
    const recommendation = state.pendingPlanUpdate;
    if (recommendation?.noticeStatus !== "reviewed") {
      if ((state.adjustmentUsageByDate[adjustmentUsageDate()] ?? 0) >= 10) return "오늘 가능한 조정횟수를 넘었어요 😓 새로운 학업정보를 바탕으로 내일 주간계획을 업데이트할게요!";
      const affectedItems = selectAllExtractedItems(state).filter((item) => recommendation?.academicEventIds.includes(item.id));
      if (recommendation && selectNextPlanningQuestion(personalizationCandidatesForUpdate(affectedItems, recommendation), state.planningProfile)) return "질문이 있어요!";
    }
    const automatic = latestAutomaticAdjustment(state);
    return automatic?.noticeStatus === "unread" ? "업데이트 사항이 있어요!" : null;
  })();
  const value = useMemo<AiMateContextValue>(() => ({ isOpen, setOpen, openWithDraft, openForPlanGeneration, openForTodo, openDefault, messages, draft, setDraft, promptChips, selectPromptChip, isResponding, responseStage, adjustmentRemaining, sendMessage, retryFailed, updateCoachmark }), [adjustmentRemaining, draft, isOpen, isResponding, messages, openDefault, openForPlanGeneration, openForTodo, openWithDraft, promptChips, responseStage, retryFailed, selectPromptChip, sendMessage, setOpen, updateCoachmark]);
  return <AiMateContext.Provider value={value}>{children}</AiMateContext.Provider>;
}

export function useAiMate() { const value = useContext(AiMateContext); if (!value) throw new Error("useAiMate must be used inside AiMateProvider"); return value; }
