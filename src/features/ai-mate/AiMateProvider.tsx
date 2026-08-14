import {
  createContext, type FormEvent, type ReactNode, useCallback, useContext, useMemo, useRef, useState,
} from "react";
import { demoClock, demoInteractionClock } from "../../application/clock";
import { generateMockWeeklyPlan } from "../../application/mockPlanEngine";
import { adjustMockPlan } from "../../application/adjustPlan";
import { updateMockPlan } from "../../application/updatePlan";
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
export interface AiMatePromptChip { label: string; draft?: string; action?: "explain-selected" | "update-plan"; }
type QuestionKind = "semester-start" | "confidence" | "pace" | "preparation" | "exam-goal";
interface PlanningQuestion {
  id: string; kind: QuestionKind; prompt: string; courseName?: string; eventId?: string;
  chips: AiMatePromptChip[];
}
interface PendingGeneration { mode: "update"; operationId: OperationId; requestText: string; question: PlanningQuestion; affectedIds: string[]; }
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
    "already-generated": { text: "이미 최초 7일 계획이 생성되어 있어요. 기존 계획 수정은 다음 단계에서 지원할 예정이에요." },
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
  const stateRef = useRef(state); stateRef.current = state;
  const appendAssistant = useCallback((message: AiMateMessage) => setMessages((current) => [...current, message]), []);
  const taskChips = useCallback((todo?: Todo, includeUpdate = true) => {
    const chips: AiMatePromptChip[] = [{ label: "주간계획 수정", draft: adjustmentDraft(todo) }];
    if (todo) chips.push({ label: "할 일 추천이유", action: "explain-selected" });
    if (includeUpdate && stateRef.current.pendingPlanUpdate) chips.push({ label: "주간계획 업데이트", action: "update-plan" });
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
    setPendingGeneration(null); setPromptChips([]);
    const result = generateMockWeeklyPlan({ operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText, user: current.user,
      documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), calendarEvents: selectCalendarEvents(current),
      existingWeeklyPlan: selectCurrentWeeklyPlan(current), existingIncompleteTodos: selectIncompleteTodos(current), planningProfile: profile });
    dispatch({ type: "plan/applied", payload: result });
    appendAssistant(result.assistantMessage);
  }, [appendAssistant, dispatch]);

  const updatePlanOrAsk = useCallback(async (operationId: string, affectedIds: string[], profile: PlanningProfile) => {
    const current = stateRef.current;
    const recommendation = current.pendingPlanUpdate;
    const plan = selectCurrentWeeklyPlan(current);
    if (!recommendation || !plan) {
      appendAssistant(assistantMessage(operationId, "현재 반영할 새로운 학업 정보가 없어요.", "update-plan"));
      return;
    }
    const affectedItems = selectAllExtractedItems(current).filter((item) => affectedIds.includes(item.id));
    const question = selectNextPlanningQuestion(affectedItems, profile);
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
    const result = updateMockPlan({ command: { operationId, requestedAt: demoInteractionClock.now().toISOString(), requestText: plan.generationRequest, user: current.user, documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), calendarEvents: selectCalendarEvents(current), existingWeeklyPlan: plan, existingIncompleteTodos: selectIncompleteTodos(current), planningProfile: profile }, weeklyPlan: plan, todos: selectTodosForCurrentPlan(current), affectedAcademicEventIds: affectedIds });
    if (result.changed) {
      dispatch({ type: "plan/adjusted", payload: { operationId, todos: result.todos, usageDate, changed: true, trigger: "NEW_ACADEMIC_INFORMATION", requestText: null, relatedAcademicEventIds: affectedIds, changedTodoIds: result.changedTodoIds ?? [] } });
    } else {
      dispatch({ type: "plan/updateProcessed", payload: { outcome: "no-change" } });
    }
    appendAssistant(result.assistantMessage);
    setPromptChips(taskChips(selectedTodoId ? current.todosById[selectedTodoId] : undefined, false));
  }, [appendAssistant, dispatch, selectedTodoId, taskChips]);

  const execute = useCallback(async (text: string, operationId: OperationId) => {
    const intent = classifyAiMateIntent(text); setResponding(true); setFailedRequest(null);
    try {
      await waitForResponse();
      if (/오류 테스트/.test(text)) throw new Error("test");
      const current = stateRef.current;
      if (intent === "generate-plan") {
        appendAssistant(assistantMessage(operationId, "주간계획을 생성하는 중입니다...", intent));
        const prerequisite = validatePlanPrerequisites({ user: current.user, documents: selectDocuments(current), extractedItems: selectAllExtractedItems(current), existingWeeklyPlan: selectCurrentWeeklyPlan(current), now: demoClock.now() });
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
      appendAssistant(assistantMessage(operationId, "학업 이벤트를 확인한 뒤 ‘주간계획 생성’을 요청할 수 있어요.", intent, [{ label: "Upload로 이동", href: "/upload" }]));
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
    setDraft(chip.draft ?? "");
  }, [execute]);

  const sendMessage = useCallback((event?: FormEvent) => {
    event?.preventDefault(); const text = draft.trim(); if (!text || isResponding) return;
    operationSequence.current += 1; const newOperationId = `ai-operation-${operationSequence.current}`;
    setMessages((current) => [...current, { id: `user-${newOperationId}`, role: "user", text, createdAt: demoInteractionClock.now().toISOString(), status: "sent", intent: pendingGeneration ? "update-plan" : classifyAiMateIntent(text), operationId: newOperationId }]);
    setDraft(""); setPromptChips([]);
    if (pendingGeneration) {
      const nextProfile = applyQuestionAnswer(stateRef.current.planningProfile, pendingGeneration.question, text);
      dispatch({ type: "planning/profileUpdated", payload: nextProfile });
      setResponding(true);
      void waitForResponse().then(() => updatePlanOrAsk(pendingGeneration.operationId, pendingGeneration.affectedIds, nextProfile)).finally(() => setResponding(false));
      return;
    }
    void execute(text, newOperationId);
  }, [dispatch, draft, execute, isResponding, pendingGeneration, updatePlanOrAsk]);

  const retryFailed = useCallback((operationId: OperationId) => { if (!isResponding && failedRequest?.operationId === operationId) void execute(failedRequest.text, operationId); }, [execute, failedRequest, isResponding]);
  const adjustmentRemaining = Math.max(0, 10 - (state.adjustmentUsageByDate[adjustmentUsageDate()] ?? 0));
  const value = useMemo<AiMateContextValue>(() => ({ isOpen, setOpen, openWithDraft, openForPlanGeneration, openForTodo, openDefault, messages, draft, setDraft, promptChips, selectPromptChip, isResponding, adjustmentRemaining, sendMessage, retryFailed, updateCoachmark: state.pendingPlanUpdate?.message ?? null }), [adjustmentRemaining, draft, isOpen, isResponding, messages, openDefault, openForPlanGeneration, openForTodo, openWithDraft, promptChips, retryFailed, selectPromptChip, sendMessage, setOpen, state.pendingPlanUpdate]);
  return <AiMateContext.Provider value={value}>{children}</AiMateContext.Provider>;
}

export function useAiMate() { const value = useContext(AiMateContext); if (!value) throw new Error("useAiMate must be used inside AiMateProvider"); return value; }
