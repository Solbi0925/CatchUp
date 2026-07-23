import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { adjustMockPlan } from "../../application/adjustPlan";
import { demoClock } from "../../application/clock";
import { generateMockWeeklyPlan } from "../../application/mockPlanEngine";
import {
  selectAllExtractedItems,
  selectCalendarEvents,
  selectCurrentWeeklyPlan,
  selectDocuments,
  selectTodosForCurrentPlan,
} from "../../domain/selectors";
import { validatePlanPrerequisites } from "../../domain/policies";
import type {
  AiMateIntent,
  AiMateMessage,
  AiMateMessageAction,
  OperationId,
  PlanPrerequisiteReason,
} from "../../domain/types";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { classifyAiMateIntent } from "./classifyAiMateIntent";

const DAILY_ADJUSTMENT_LIMIT = 10;
const DEMO_USAGE_DATE = "2026-07-19";

interface FailedRequest {
  operationId: OperationId;
  text: string;
}

interface AiMateContextValue {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  messages: AiMateMessage[];
  draft: string;
  setDraft: (draft: string) => void;
  isResponding: boolean;
  adjustmentRemaining: number;
  sendMessage: (event?: FormEvent) => void;
  retryFailed: (operationId: OperationId) => void;
}

const AiMateContext = createContext<AiMateContextValue | null>(null);

function waitForMockResponse() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 650);
  });
}

function assistantMessage(
  operationId: OperationId,
  text: string,
  intent: AiMateIntent,
  actions?: AiMateMessageAction[],
): AiMateMessage {
  return {
    id: `assistant-${operationId}`,
    role: "assistant",
    text,
    createdAt: demoClock.now().toISOString(),
    status: "sent",
    intent,
    operationId,
    actions,
  };
}

function prerequisiteMessage(
  operationId: OperationId,
  reason: PlanPrerequisiteReason,
): AiMateMessage {
  const messages: Record<
    PlanPrerequisiteReason,
    { text: string; actions?: AiMateMessageAction[] }
  > = {
    "not-scheduled": {
      text: "주간 계획은 설정한 일요일 오후 8시부터 한 번 만들 수 있어요.",
    },
    "no-upload": {
      text: "계획을 만들려면 먼저 학업 자료가 필요해요.",
      actions: [{ label: "Upload로 이동", href: "/upload" }],
    },
    "calendar-disconnected": {
      text: "개인 일정을 반영하려면 Google Calendar 연결이 필요해요.",
    },
    "needs-review": {
      text: "확인이 필요한 추출 결과가 있어요. 내용을 확인하고 저장해주세요.",
      actions: [{ label: "Upload로 이동", href: "/upload" }],
    },
    "already-generated": {
      text:
        "이번 주 계획은 이미 생성했어요.\n변경할 내용이 있다면 원하는 방식으로 조정을 요청해주세요.",
    },
  };
  const response = messages[reason];
  return assistantMessage(operationId, response.text, "generate-plan", response.actions);
}

export function AiMateProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = usePrototypeStore();
  const [isOpen, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMateMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isResponding, setResponding] = useState(false);
  const [failedRequest, setFailedRequest] = useState<FailedRequest | null>(null);
  const operationSequence = useRef(0);
  const attemptsByOperation = useRef<Record<OperationId, number>>({});

  const adjustmentUsed = state.adjustmentUsageByDate[DEMO_USAGE_DATE] ?? 0;
  const adjustmentRemaining = Math.max(0, DAILY_ADJUSTMENT_LIMIT - adjustmentUsed);

  const appendAssistant = useCallback((message: AiMateMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const execute = useCallback(
    async (text: string, operationId: OperationId) => {
      const intent = classifyAiMateIntent(text);
      attemptsByOperation.current[operationId] =
        (attemptsByOperation.current[operationId] ?? 0) + 1;
      setResponding(true);
      setFailedRequest(null);
      try {
        await waitForMockResponse();
        if (/오류 테스트/.test(text) && attemptsByOperation.current[operationId] === 1) {
          throw new Error("mock-request-failed");
        }

        if (intent === "generate-plan") {
          const documents = selectDocuments(state);
          const extractedItems = selectAllExtractedItems(state);
          const existingWeeklyPlan = selectCurrentWeeklyPlan(state);
          const prerequisite = validatePlanPrerequisites({
            user: state.user,
            documents,
            extractedItems,
            existingWeeklyPlan,
            now: demoClock.now(),
          });
          if (!prerequisite.ok) {
            appendAssistant(prerequisiteMessage(operationId, prerequisite.reason));
            return;
          }
          const result = generateMockWeeklyPlan({
            operationId,
            requestedAt: demoClock.now().toISOString(),
            requestText: text,
            user: state.user,
            documents,
            extractedItems,
            calendarEvents: selectCalendarEvents(state),
            existingWeeklyPlan,
          });
          dispatch({ type: "plan/applied", payload: result });
          appendAssistant(result.assistantMessage);
          return;
        }

        if (intent === "adjust-plan") {
          const existingWeeklyPlan = selectCurrentWeeklyPlan(state);
          if (!existingWeeklyPlan) {
            appendAssistant(
              assistantMessage(
                operationId,
                "먼저 이번 주 계획을 만들어주세요.",
                intent,
              ),
            );
            return;
          }
          if (adjustmentRemaining === 0) {
            appendAssistant(
              assistantMessage(
                operationId,
                "오늘 가능한 계획 조정을 모두 사용했어요. 내일 다시 조정할 수 있어요. 추천 이유를 묻거나 현재 계획을 확인하는 대화는 계속할 수 있어요.",
                intent,
              ),
            );
            return;
          }
          const result = adjustMockPlan({
            operationId,
            requestText: text,
            requestedAt: demoClock.now().toISOString(),
            todos: selectTodosForCurrentPlan(state),
          });
          dispatch({
            type: "plan/adjusted",
            payload: {
              operationId,
              todos: result.todos,
              usageDate: DEMO_USAGE_DATE,
              changed: result.changed,
            },
          });
          appendAssistant(result.assistantMessage);
          return;
        }

        if (intent === "explain") {
          const todos = selectTodosForCurrentPlan(state);
          appendAssistant(
            assistantMessage(
              operationId,
              todos[0]?.recommendationReason ??
                "아직 생성된 계획이 없어요. 자료를 확인한 뒤 이번 주 계획 생성을 요청해주세요.",
              intent,
            ),
          );
          return;
        }

        if (intent === "help") {
          appendAssistant(
            assistantMessage(
              operationId,
              "PDF 또는 이미지 자료를 올린 뒤 이번 주 계획 생성이나 계획 조정을 요청할 수 있어요.",
              intent,
              [{ label: "Upload로 이동", href: "/upload" }],
            ),
          );
          return;
        }

        appendAssistant(
          assistantMessage(
            operationId,
            "이번 주 계획 생성, 특정 요일의 계획 조정, 추천 이유를 물어볼 수 있어요.",
            intent,
          ),
        );
      } catch {
        const failed = assistantMessage(
          operationId,
          "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
          intent,
          [{ label: "다시 시도", action: "retry" }],
        );
        failed.status = "failed";
        appendAssistant(failed);
        setFailedRequest({ operationId, text });
      } finally {
        setResponding(false);
      }
    },
    [adjustmentRemaining, appendAssistant, dispatch, state],
  );

  const sendMessage = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = draft.trim();
      if (!text || isResponding) return;
      operationSequence.current += 1;
      const operationId = `ai-operation-${operationSequence.current}`;
      const userMessage: AiMateMessage = {
        id: `user-${operationId}`,
        role: "user",
        text,
        createdAt: demoClock.now().toISOString(),
        status: "sent",
        intent: classifyAiMateIntent(text),
        operationId,
      };
      setMessages((current) => [...current, userMessage]);
      setDraft("");
      void execute(text, operationId);
    },
    [draft, execute, isResponding],
  );

  const retryFailed = useCallback(
    (operationId: OperationId) => {
      if (isResponding || failedRequest?.operationId !== operationId) return;
      setMessages((current) =>
        current.filter(
          (message) => !(message.operationId === operationId && message.status === "failed"),
        ),
      );
      void execute(failedRequest.text, operationId);
    },
    [execute, failedRequest, isResponding],
  );

  const value = useMemo<AiMateContextValue>(
    () => ({
      isOpen,
      setOpen,
      messages,
      draft,
      setDraft,
      isResponding,
      adjustmentRemaining,
      sendMessage,
      retryFailed,
    }),
    [
      adjustmentRemaining,
      draft,
      isOpen,
      isResponding,
      messages,
      retryFailed,
      sendMessage,
    ],
  );

  return <AiMateContext.Provider value={value}>{children}</AiMateContext.Provider>;
}

export function useAiMate() {
  const value = useContext(AiMateContext);
  if (!value) throw new Error("useAiMate must be used inside AiMateProvider");
  return value;
}
