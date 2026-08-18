import {
  createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { demoInteractionClock } from "../../application/clock";
import { generateMockWeeklyPlan } from "../../application/mockPlanEngine";
import { adjustMockPlan } from "../../application/adjustPlan";
import { updateMockPlan } from "../../application/updatePlan";
import { parsePlanConstraints, validatePlanConstraints } from "../../application/planConstraints";
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

const INITIAL_MESSAGES: AiMateMessage[] = [
  { id: "catch-introduction", role: "assistant", text: "안녕하세요! 여러분의 AI Mate 캐치예요.", createdAt: demoInteractionClock.now().toISOString(), status: "sent" },
  { id: "catch-plan-guidance", role: "assistant", text: "확인한 학업 이벤트를 바탕으로 오늘부터 7일 계획을 만들 수 있어요.", createdAt: demoInteractionClock.now().toISOString(), status: "sent" },
];

export const GENERATE_PLAN_DRAFT = "주간계획 생성해줘. 다음의 요청사항을 반영해: ";
export interface AiMatePromptChip { label: string; draft?: string; action?: "explain-selected" | "update-plan" | "undo-auto-update"; }
type QuestionKind = "semester-start" | "confidence" | "pace" | "preparation" | "exam-goal";
interface PlanningQuestion {
  id: string; kind: QuestionKind; prompt: string; courseName?: string; eventId?: string;
  chips: AiMatePromptChip[];
}
type PendingGeneration =
  | { mode: "generate"; operationId: OperationId; requestText: string; question: PlanningQuestion }
  | { mode: "update"; operationId: OperationId; requestText: string; question: PlanningQuestion; affectedIds: string[] };
interface FailedRequest { operationId: OperationId; text: string; }
interface AiMateContextValue {
  isOpen: boolean; setOpen: (open: boolean) => void; openWithDraft: (draft: string, chips?: AiMatePromptChip[]) => void;
  openForTodo: (todoId: string) => void; openDefault: () => void;
  openForPlanGeneration: () => void; messages: AiMateMessage[]; draft: string; setDraft: (draft: string) => void;
  promptChips: AiMatePromptChip[]; selectPromptChip: (chip: AiMatePromptChip) => void; isResponding: boolean;
  adjustmentRemaining: number; sendMessage: (event?: FormEvent) => void; retryFailed: (operationId: OperationId) => void;
  updateCoachmark: string | null;
}

const AiMateContext = createContext<AiMateContextValue | null>(null);
const waitForResponse = () => new Promise<void>((resolve) => window.setTimeout(resolve, 350));
function assistantMessage(operationId: OperationId, text: string, intent: AiMateIntent, actions?: AiMateMessageAction[]): AiMateMessage {
  return { id: `assistant-${operationId}-${Date.now()}`, role: "assistant", text, createdAt: demoInteractionClock.now().toISOString(), status: "sent", intent, operationId, actions };
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

export function selectWeekMappingQuestion(items: ExtractedItem[], profile: PlanningProfile): PlanningQuestion | null {
  const needsWeekMapping = items.some((item) =>
    item.date === null && item.scheduledWeek !== null && item.weekOneStartDate === null,
  );
  if (!needsWeekMapping || profile.semesterWeekOneStartDate !== null) return null;
  return {
    id: "semester-week-one-start",
    kind: "semester-start",
    prompt: "주차별 학업 일정을 Today와 Month의 실제 날짜에 표시하려면 시작일이 필요해요. 이번 학기 1주차는 언제 시작하나요? YYYY-MM-DD 형식으로 알려주세요.",
    chips: [],
  };
}

function applyQuestionAnswer(profile: PlanningProfile, question: PlanningQuestion, answer: string): PlanningProfile {
  if (question.kind === "semester-start") {
    const match = answer.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!match) return profile;
    const candidate = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const parsed = new Date(`${candidate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) return profile;
    return { ...profile, semesterWeekOneStartDate: candidate };
  }
  if (question.kind === "confidence" && question.courseName) return { ...profile, confidenceByCourse: { ...profile.confidenceByCourse, [question.courseName]: /높|있/.test(answer) ? "high" : /낮|없/.test(answer) ? "low" : "medium" } };
  if (question.kind === "pace") return { ...profile, pace: /빠/.test(answer) ? "fast" : /느|여유/.test(answer) ? "slow" : "average" };
  if (question.kind === "preparation" && question.eventId) return { ...profile, preparationByEventId: { ...profile.preparationByEventId, [question.eventId]: /기초|다시/.test(answer) ? "restart-needed" : /복습/.test(answer) ? "review-needed" : "ready" } };
  if (question.kind === "exam-goal" && question.eventId) return { ...profile, examGoalByEventId: { ...profile.examGoalByEventId, [question.eventId]: /^A/i.test(answer) ? "a" : /^B/i.test(answer) ? "b" : /^C/i.test(answer) ? "c" : "pass" } };
  return profile;
}

export function AiMateProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = usePrototypeStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMateMessage[]>(() => INITIAL_MESSAGES.map((message) => ({ ...message })));
  const [draft, setDraft] = useState("");
  const [promptChips, setPromptChips] = useState<AiMatePromptChip[]>([]);
  const [isResponding, setResponding] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
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
    const chips: AiMatePromptChip[] = [{ label: "주간계획 수정", draft: adjustmentDraft(todo) }];
    if (todo) chips.push({ label: "할 일 추천이유", action: "explain-selected" });
    const automatic = latestAutomaticAdjustment(stateRef.current);
    if (includeUpdate && automatic) chips.push({ label: "아냐, 취소해줘", action: "undo-auto-update" });
    return chips;
  }, []);
  const setOpen = useCallback((open: boolean) => { setIsOpen(open); if (!open) { setPromptChips([]); setSelectedTodoId(null); } }, []);
  const openWithDraft = useCallback((nextDraft: string, chips: AiMatePromptChip[] = []) => { setDraft(nextDraft); setPromptChips(chips); setIsOpen(true); }, []);
  const openForPlanGeneration = useCallback(() => openWithDraft("", [{ label: "주간계획 생성", draft: GENERATE_PLAN_DRAFT }]), [openWithDraft]);
  const openForTodo = useCallback((todoId: string) => {
    const todo = stateRef.current.todosById[todoId];
    if (!todo) return;
    setSelectedTodoId(todoId); setDraft(""); setPromptChips(taskChips(todo)); setIsOpen(true);
  }, [taskChips]);
  const openDefault = useCallback(() => {
    const current = stateRef.current;
    if (!selectCurrentWeeklyPlan(current)) { openForPlanGeneration(); return; }
    setSelectedTodoId(null); setDraft(""); setPromptChips(taskChips()); setIsOpen(true);
  }, [openForPlanGeneration, taskChips]);

  const generatePlan = useCallback(async (operationId: string, requestText: string, profile: PlanningProfile) => {
    const current = stateRef.current;
    const mappingQuestion = selectWeekMappingQuestion(selectAllExtractedItems(current), profile);
    if (mappingQuestion) {
      setPendingGeneration({ mode: "generate", operationId, requestText, question: mappingQuestion });
      setPromptChips(mappingQuestion.chips);
      appendAssistant(assistantMessage(operationId, mappingQuestion.prompt, "generate-plan"));
      return;
    }
    setPendingGeneration(null); setPromptChips([]);
    const result = generateMockWeeklyPlan({ operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText, user: current.user,
      documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), calendarEvents: selectCalendarEvents(current),
      existingWeeklyPlan: selectCurrentWeeklyPlan(current), existingIncompleteTodos: selectIncompleteTodos(current), planningProfile: profile });
    if (!result.validationError) dispatch({ type: "plan/applied", payload: result });
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
    processedUpdateRef.current.add(recommendation.id);
    const result = updateMockPlan({ command: { operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText: plan.generationRequest, user: current.user, documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), calendarEvents: selectCalendarEvents(current), existingWeeklyPlan: plan, existingIncompleteTodos: selectIncompleteTodos(current), planningProfile: profile }, weeklyPlan: plan, todos: selectTodosForCurrentPlan(current), affectedAcademicEventIds: affectedIds, previousAcademicEvents: recommendation.previousAcademicEvents });
    if (result.changed) {
      dispatch({ type: "plan/adjusted", payload: { operationId, todos: result.todos, usageDate, changed: true, trigger: "NEW_ACADEMIC_INFORMATION", requestText: null, relatedAcademicEventIds: affectedIds, changedTodoIds: result.changedTodoIds ?? [], summary: result.assistantMessage.text, diff: result.planDiff } });
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

  const execute = useCallback(async (text: string, operationId: OperationId) => {
    const intent = classifyAiMateIntent(text); setResponding(true); setFailedRequest(null);
    try {
      await waitForResponse();
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
        const todos = selectTodosForCurrentPlan(current);
        const request = adjustmentRequest(text);
        if (!plan) { appendAssistant(assistantMessage(operationId, "먼저 주간계획을 생성해주세요.", intent)); return; }
        if (!request) {
          appendAssistant(assistantMessage(operationId, "요청사항이 입력되지 않았습니다. 수정을 원하는 사항을 입력해주세요.", intent));
          setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined));
          return;
        }
        const usageDate = adjustmentUsageDate();
        if ((current.adjustmentUsageByDate[usageDate] ?? 0) >= 10) {
          appendAssistant(assistantMessage(operationId, "오늘 가능한 주간계획 조정 10회를 모두 사용했어요. 내일부터 다시 계획을 조정할 수 있어요.", intent));
          setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined));
          return;
        }
        const result = adjustMockPlan({ operationId, requestText: request, requestedAt: demoInteractionClock.now().toISOString(), weeklyPlan: plan, todos, academicEvents: selectAllExtractedItems(current), selectedTodoId });
        const validation = result.changed ? validatePlanConstraints(result.todos, parsePlanConstraints(request), plan, selectAllExtractedItems(current), todos) : { ok: true, violations: [] };
        if (result.changed && !validation.ok) {
          appendAssistant(assistantMessage(operationId, `요청한 조건과 마감 기준을 검증하지 못해 계획을 변경하지 않았어요. ${validation.violations.join(", ")}`, intent));
          setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined));
          return;
        }
        if (result.changed) dispatch({ type: "plan/adjusted", payload: { operationId, todos: result.todos, usageDate, changed: true, trigger: "USER_REQUEST", requestText: request, relatedAcademicEventIds: [...new Set(result.todos.filter((todo) => result.changedTodoIds?.includes(todo.id)).map((todo) => todo.sourceExtractedItemId))], changedTodoIds: result.changedTodoIds ?? [] } });
        appendAssistant(result.assistantMessage); setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined)); return;
      }
      if (intent === "update-plan") {
        const plan = selectCurrentWeeklyPlan(current);
        const recommendation = current.pendingPlanUpdate;
        if (!plan || !recommendation) { appendAssistant(assistantMessage(operationId, "현재 반영할 새로운 학업 정보가 없어요.", intent)); return; }
        const usageDate = adjustmentUsageDate();
        if ((current.adjustmentUsageByDate[usageDate] ?? 0) >= 10) { appendAssistant(assistantMessage(operationId, "오늘 가능한 주간계획 조정 10회를 모두 사용했어요. 내일부터 다시 계획을 조정할 수 있어요.", intent)); return; }
        const affectedIds = recommendation.academicEventIds.length
          ? recommendation.academicEventIds.filter((id) => Boolean(current.extractedItemsById[id]))
          : [...new Set(selectTodosForCurrentPlan(current).filter((todo) => !todo.isCompleted).map((todo) => todo.sourceExtractedItemId))];
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
    } finally { setResponding(false); }
  }, [appendAssistant, dispatch, generatePlan, selectedTodoId, taskChips, updatePlanOrAsk]);

  const selectPromptChip = useCallback((chip: AiMatePromptChip) => {
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
  }, [execute]);

  const sendMessage = useCallback((event?: FormEvent) => {
    event?.preventDefault(); const text = draft.trim(); if (!text || isResponding) return;
    operationSequence.current += 1; const newOperationId = `ai-operation-${operationSequence.current}`;
    setMessages((current) => [...current, { id: `user-${newOperationId}`, role: "user", text, createdAt: demoInteractionClock.now().toISOString(), status: "sent", intent: pendingGeneration?.mode === "update" ? "update-plan" : pendingGeneration?.mode === "generate" ? "generate-plan" : classifyAiMateIntent(text), operationId: newOperationId }]);
    setDraft(""); setPromptChips([]);
    if (pendingGeneration) {
      const nextProfile = applyQuestionAnswer(stateRef.current.planningProfile, pendingGeneration.question, text);
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
  }, [appendAssistant, dispatch, draft, execute, generatePlan, isResponding, pendingGeneration, updatePlanOrAsk]);

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
  const value = useMemo<AiMateContextValue>(() => ({ isOpen, setOpen, openWithDraft, openForPlanGeneration, openForTodo, openDefault, messages, draft, setDraft, promptChips, selectPromptChip, isResponding, adjustmentRemaining, sendMessage, retryFailed, updateCoachmark }), [adjustmentRemaining, draft, isOpen, isResponding, messages, openDefault, openForPlanGeneration, openForTodo, openWithDraft, promptChips, retryFailed, selectPromptChip, sendMessage, setOpen, updateCoachmark]);
  return <AiMateContext.Provider value={value}>{children}</AiMateContext.Provider>;
}

export function useAiMate() { const value = useContext(AiMateContext); if (!value) throw new Error("useAiMate must be used inside AiMateProvider"); return value; }
