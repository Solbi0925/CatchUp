import type {
  CalendarEvent,
  CalendarEventId,
  DocumentId,
  ExtractedItem,
  ExtractedItemId,
  ExtractionResult,
  GeneratePlanResult,
  OperationId,
  Todo,
  TodoId,
  User,
  WeeklyPlan,
  WeeklyPlanId,
  UploadedDocument,
  PlanningProfile,
  PlanAdjustment,
  PlanAdjustmentTrigger,
  PlanUpdateRecommendation,
} from "../domain/types";
import { demoInteractionClock } from "../application/clock";
import { assessAcademicEventConfirmation } from "../domain/academicEventStatus";
import { mergeAcademicEventBatch } from "../domain/mergeAcademicEvents";
import { demoUser } from "../mocks/templates";
import type { CalendarCategoryColor } from "../features/calendar/calendarColors";
import { createPlanUpdateRecommendation } from "../domain/planUpdates";

type EditableCalendarEventFields = Pick<
  CalendarEvent,
  "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType"
>;
type EditableExtractedItemFields = Pick<ExtractedItem, "title" | "date" | "time"> & { isAllDay?: boolean };
type ImmutableCalendarEventFields = {
  [Field in keyof Pick<CalendarEvent, "userId" | "source" | "updatedAt">]?: never;
};

export type CreateCalendarEventPayload =
  & { id: CalendarEventId }
  & EditableCalendarEventFields
  & ImmutableCalendarEventFields;
export type UpdateCalendarEventPayload =
  & { id: CalendarEventId }
  & EditableCalendarEventFields
  & ImmutableCalendarEventFields;

function pickEditableCalendarEventFields({
  title,
  date,
  startTime,
  endTime,
  isAllDay,
  eventType,
}: EditableCalendarEventFields): EditableCalendarEventFields {
  return { title, date, startTime, endTime, isAllDay, eventType };
}

function scheduleUpdateRecommendation(state: PrototypeState, message: string, academicEventIds: ExtractedItemId[] = [], previousAcademicEvents?: ExtractedItem[]): PlanUpdateRecommendation | null {
  if (!Object.keys(state.weeklyPlansById).length) return state.pendingPlanUpdate;
  const detectedAt = demoInteractionClock.now().toISOString();
  return { id: `plan-update-schedule-${detectedAt}`, reasonKind: "schedule-updated", academicEventIds, message, detectedAt, status: "pending", noticeStatus: "unread", previousAcademicEvents };
}

export interface PrototypeState {
  user: User;
  onboarding: {
    introSeen: boolean;
    calendarStep: "idle" | "connecting" | "connected" | "error" | "skipped";
  };
  documentsById: Record<DocumentId, UploadedDocument>;
  extractedItemsById: Record<ExtractedItemId, ExtractedItem>;
  extractedItemIdsByDocumentId: Record<DocumentId, ExtractedItemId[]>;
  calendarEventsById: Record<CalendarEventId, CalendarEvent>;
  weeklyPlansById: Record<WeeklyPlanId, WeeklyPlan>;
  todosById: Record<TodoId, Todo>;
  todoIdsByWeeklyPlanId: Record<WeeklyPlanId, TodoId[]>;
  adjustmentUsageByDate: Record<string, number>;
  planAdjustmentsById: Record<string, PlanAdjustment>;
  pendingPlanUpdate: PlanUpdateRecommendation | null;
  processedPlanUpdatesById: Record<string, PlanUpdateRecommendation>;
  categoryColorByKey: Record<string, CalendarCategoryColor>;
  appliedOperations: Record<OperationId, "extraction" | "plan" | "adjustment">;
  planningProfile: PlanningProfile;
}

export type PrototypeAction =
  | { type: "demo/reset"; payload: Record<string, never> }
  | { type: "onboarding/introCompleted"; payload: Record<string, never> }
  | { type: "calendar/connectionStarted"; payload: Record<string, never> }
  | { type: "calendar/connectionSucceeded"; payload: { events: CalendarEvent[] } }
  | { type: "calendar/connectionFailed"; payload: Record<string, never> }
  | { type: "calendar/onboardingSkipped"; payload: Record<string, never> }
  | {
      type: "calendar/eventCreated";
      payload: CreateCalendarEventPayload;
    }
  | {
      type: "calendar/eventUpdated";
      payload: UpdateCalendarEventPayload;
    }
  | { type: "calendar/eventDeleted"; payload: { id: CalendarEventId } }
  | {
      type: "calendar/categoryColorSet";
      payload: { categoryKey: string; color: CalendarCategoryColor };
    }
  | { type: "todo/completionSet"; payload: { todoId: TodoId; isCompleted: boolean } }
  | { type: "extraction/applied"; payload: ExtractionResult }
  | {
      type: "extraction/itemUpdated";
      payload: { id: ExtractedItemId } & EditableExtractedItemFields;
    }
  | { type: "extraction/itemReplaced"; payload: ExtractedItem }
  | {
      type: "extraction/classMeetingUpdated";
      payload: { id: ExtractedItemId; meetingId: string; title: string; weekday: ExtractedItem["classMeetingTimes"][number]["weekday"]; startTime: string; endTime: string };
    }
  | { type: "extraction/classMeetingDeleted"; payload: { id: ExtractedItemId; meetingId: string } }
  | { type: "extraction/itemDeleted"; payload: { id: ExtractedItemId } }
  | {
      type: "extraction/confirmed";
      payload: { items: ExtractedItem[]; deletedItemIds?: ExtractedItemId[] };
    }
  | { type: "plan/applied"; payload: GeneratePlanResult }
  | { type: "planning/profileUpdated"; payload: Partial<PlanningProfile> }
  | {
      type: "plan/adjusted";
      payload: {
        operationId: OperationId; todos: Todo[]; usageDate: string; changed: boolean;
        trigger: PlanAdjustmentTrigger; requestText: string | null;
        relatedAcademicEventIds: ExtractedItemId[]; changedTodoIds: TodoId[]; summary?: string; diff?: import("../domain/types").PlanDiff;
      };
    }
  | { type: "plan/automaticUpdateUndone"; payload: { adjustmentId: string } }
  | { type: "plan/adjustmentNoticeReviewed"; payload: { adjustmentId: string } }
  | { type: "plan/updateNoticeReviewed"; payload: Record<string, never> }
  | {
      type: "plan/updateDismissed";
      payload: Record<string, never>;
    }
  | {
      type: "plan/updateProcessed";
      payload: { outcome: "changed" | "no-change" | "dismissed" };
    }
  | { type: "extraction/updateReviewed"; payload: { id: ExtractedItemId } };

export function createInitialPrototypeState(): PrototypeState {
  return {
    user: { ...demoUser },
    onboarding: {
      introSeen: false,
      calendarStep: "idle",
    },
    documentsById: {},
    extractedItemsById: {},
    extractedItemIdsByDocumentId: {},
    calendarEventsById: {},
    weeklyPlansById: {},
    todosById: {},
    todoIdsByWeeklyPlanId: {},
    adjustmentUsageByDate: {},
    planAdjustmentsById: {},
    pendingPlanUpdate: null,
    processedPlanUpdatesById: {},
    categoryColorByKey: {},
    appliedOperations: {},
    planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {} },
  };
}

export function prototypeReducer(
  state: PrototypeState,
  action: PrototypeAction,
): PrototypeState {
  if ("operationId" in action.payload && state.appliedOperations[action.payload.operationId]) {
    return state;
  }

  switch (action.type) {
    case "demo/reset":
      return createInitialPrototypeState();
    case "onboarding/introCompleted":
      if (state.onboarding.introSeen) return state;
      return {
        ...state,
        onboarding: { ...state.onboarding, introSeen: true },
      };
    case "calendar/connectionStarted":
      return {
        ...state,
        user: { ...state.user, calendarConnectionStatus: "connecting" },
        onboarding: { ...state.onboarding, introSeen: true, calendarStep: "connecting" },
      };
    case "calendar/connectionSucceeded":
      return {
        ...state,
        user: { ...state.user, calendarConnectionStatus: "connected" },
        onboarding: { ...state.onboarding, introSeen: true, calendarStep: "connected" },
        calendarEventsById: {
          ...Object.fromEntries(
            action.payload.events
              .filter((event) => event.source === "google-calendar")
              .map((event) => [event.id, event]),
          ),
          ...Object.fromEntries(
            Object.values(state.calendarEventsById)
              .filter((event) => event.source === "catchup")
              .map((event) => [event.id, event]),
          ),
        },
      };
    case "calendar/connectionFailed":
      return {
        ...state,
        user: { ...state.user, calendarConnectionStatus: "failed" },
        onboarding: { ...state.onboarding, introSeen: true, calendarStep: "error" },
      };
    case "calendar/onboardingSkipped":
      return {
        ...state,
        user: { ...state.user, calendarConnectionStatus: "disconnected" },
        onboarding: { ...state.onboarding, introSeen: true, calendarStep: "skipped" },
        calendarEventsById: Object.fromEntries(
          Object.values(state.calendarEventsById)
            .filter((event) => event.source === "catchup")
            .map((event) => [event.id, event]),
        ),
      };
    case "calendar/eventCreated": {
      const { id } = action.payload;
      const editableFields = pickEditableCalendarEventFields(action.payload);
      const pendingPlanUpdate = Object.keys(state.weeklyPlansById).length ? {
        id: `plan-update-calendar-${demoInteractionClock.now().toISOString()}`,
        reasonKind: "schedule-updated" as const,
        academicEventIds: [],
        message: "새로운 서비스 내 일정이 추가되었어요. 주간계획을 업데이트할까요?",
        detectedAt: demoInteractionClock.now().toISOString(),
        status: "pending" as const,
        noticeStatus: "unread" as const,
      } : state.pendingPlanUpdate;
      return {
        ...state,
        calendarEventsById: {
          ...state.calendarEventsById,
          [id]: {
            id,
            userId: state.user.id,
            ...editableFields,
            source: "catchup",
            updatedAt: demoInteractionClock.now().toISOString(),
          },
        },
        pendingPlanUpdate,
      };
    }
    case "calendar/eventUpdated": {
      const existingEvent = state.calendarEventsById[action.payload.id];
      if (!existingEvent) return state;
      const { id } = action.payload;
      const editableFields = pickEditableCalendarEventFields(action.payload);
      return {
        ...state,
        calendarEventsById: {
          ...state.calendarEventsById,
          [id]: {
            ...existingEvent,
            ...editableFields,
            updatedAt: demoInteractionClock.now().toISOString(),
          },
        },
        pendingPlanUpdate: Object.keys(state.weeklyPlansById).length ? {
          id: `plan-update-calendar-${demoInteractionClock.now().toISOString()}`,
          reasonKind: "schedule-updated",
          academicEventIds: [],
          message: "변경된 개인 일정을 반영해 주간계획을 자동으로 정리할게요.",
          detectedAt: demoInteractionClock.now().toISOString(),
          status: "pending",
          noticeStatus: "unread",
        } : state.pendingPlanUpdate,
      };
    }
    case "calendar/eventDeleted": {
      const existingEvent = state.calendarEventsById[action.payload.id];
      if (!existingEvent) return state;
      const { [action.payload.id]: _deletedEvent, ...calendarEventsById } = state.calendarEventsById;
      return {
        ...state,
        calendarEventsById,
        pendingPlanUpdate: Object.keys(state.weeklyPlansById).length ? {
          id: `plan-update-calendar-${demoInteractionClock.now().toISOString()}`,
          reasonKind: "schedule-updated",
          academicEventIds: [],
          message: "삭제된 개인 일정을 반영해 주간계획을 자동으로 정리할게요.",
          detectedAt: demoInteractionClock.now().toISOString(),
          status: "pending",
          noticeStatus: "unread",
        } : state.pendingPlanUpdate,
      };
    }
    case "calendar/categoryColorSet":
      return {
        ...state,
        categoryColorByKey: {
          ...state.categoryColorByKey,
          [action.payload.categoryKey]: action.payload.color,
        },
      };
    case "todo/completionSet": {
      const todo = state.todosById[action.payload.todoId];
      if (!todo || todo.isCompleted === action.payload.isCompleted) return state;
      return {
        ...state,
        todosById: {
          ...state.todosById,
          [todo.id]: { ...todo, isCompleted: action.payload.isCompleted },
        },
      };
    }
    case "extraction/applied": {
      const { documents, extractedItems, operationId } = action.payload;
      const mergedItems = mergeAcademicEventBatch(
        Object.values(state.extractedItemsById),
        extractedItems,
      );
      const pendingPlanUpdate = Object.keys(state.weeklyPlansById).length
        ? createPlanUpdateRecommendation(state.extractedItemsById, mergedItems, demoInteractionClock.now().toISOString()) ?? state.pendingPlanUpdate
        : state.pendingPlanUpdate;
      return {
        ...state,
        documentsById: {
          ...state.documentsById,
          ...Object.fromEntries(documents.map((document) => [document.id, document])),
        },
        extractedItemsById: {
          ...state.extractedItemsById,
          ...Object.fromEntries(mergedItems.map((item) => [item.id, item])),
        },
        extractedItemIdsByDocumentId: {
          ...state.extractedItemIdsByDocumentId,
          ...Object.fromEntries(
            documents.map((document) => [
              document.id,
              mergedItems
                .filter((item) => item.sourceDocumentIds.includes(document.id))
                .map((item) => item.id),
            ]),
          ),
        },
        appliedOperations: {
          ...state.appliedOperations,
          [operationId]: "extraction",
        },
        pendingPlanUpdate,
      };
    }
    case "extraction/itemUpdated": {
      const item = state.extractedItemsById[action.payload.id];
      if (!item) return state;
      const { id, ...editableFields } = action.payload;
      const assessed = assessAcademicEventConfirmation({ ...item, ...editableFields });
      const updatedItem = {
        ...item,
        ...editableFields,
        ...assessed,
        dateCertainty: editableFields.date ? "exact-date" as const : item.scheduledWeek ? "academic-week" as const : "unknown" as const,
        isAllDay: editableFields.isAllDay ?? item.isAllDay ?? false,
        revision: item.revision + 1,
        updateNoticeStatus: "reviewed" as const,
        updatedAt: demoInteractionClock.now().toISOString(),
        isUserEdited: true,
      };
      return {
        ...state,
        extractedItemsById: {
          ...state.extractedItemsById,
          [id]: updatedItem,
        },
        pendingPlanUpdate: Object.keys(state.weeklyPlansById).length
          ? createPlanUpdateRecommendation({ [id]: item }, [updatedItem], demoInteractionClock.now().toISOString()) ?? state.pendingPlanUpdate
          : state.pendingPlanUpdate,
      };
    }
    case "extraction/itemReplaced": {
      const item = state.extractedItemsById[action.payload.id];
      if (!item) return state;
      const assessed = assessAcademicEventConfirmation(action.payload);
      const updatedItem = { ...action.payload, ...assessed, revision: item.revision + 1, updateNoticeStatus: "reviewed" as const, updatedAt: demoInteractionClock.now().toISOString(), isUserEdited: true };
      return { ...state, extractedItemsById: { ...state.extractedItemsById, [item.id]: updatedItem }, pendingPlanUpdate: Object.keys(state.weeklyPlansById).length ? createPlanUpdateRecommendation({ [item.id]: item }, [updatedItem], demoInteractionClock.now().toISOString()) ?? state.pendingPlanUpdate : state.pendingPlanUpdate };
    }
    case "extraction/classMeetingUpdated": {
      const item = state.extractedItemsById[action.payload.id];
      if (!item || item.itemType !== "class-schedule") return state;
      const previousMeeting = item.classMeetingTimes.find((meeting) => meeting.id === action.payload.meetingId);
      if (!previousMeeting) return state;
      const updatedItem = {
        ...item,
        title: action.payload.title,
        courseName: action.payload.title,
        classMeetingTimes: item.classMeetingTimes.map((meeting) => meeting.id === action.payload.meetingId ? {
          ...meeting,
          weekday: action.payload.weekday,
          startTime: action.payload.startTime,
          endTime: action.payload.endTime,
        } : meeting),
        revision: item.revision + 1,
        updateNoticeStatus: "reviewed" as const,
        updatedAt: demoInteractionClock.now().toISOString(),
        isUserEdited: true,
      };
      return {
        ...state,
        extractedItemsById: { ...state.extractedItemsById, [item.id]: updatedItem },
        pendingPlanUpdate: scheduleUpdateRecommendation(state, "변경된 수업 일정을 반영해 주간계획을 자동으로 정리할게요.", [item.id], [item]),
      };
    }
    case "extraction/classMeetingDeleted": {
      const item = state.extractedItemsById[action.payload.id];
      if (!item || item.itemType !== "class-schedule") return state;
      const classMeetingTimes = item.classMeetingTimes.filter((meeting) => meeting.id !== action.payload.meetingId);
      if (classMeetingTimes.length === item.classMeetingTimes.length) return state;
      if (classMeetingTimes.length === 0) {
        const { [item.id]: _deleted, ...extractedItemsById } = state.extractedItemsById;
        return { ...state, extractedItemsById, extractedItemIdsByDocumentId: Object.fromEntries(Object.entries(state.extractedItemIdsByDocumentId).map(([documentId, ids]) => [documentId, ids.filter((id) => id !== item.id)])), pendingPlanUpdate: scheduleUpdateRecommendation(state, "삭제된 수업 일정을 반영해 주간계획을 자동으로 정리할게요.", [item.id], [item]) };
      }
      const updatedItem = { ...item, classMeetingTimes, revision: item.revision + 1, updatedAt: demoInteractionClock.now().toISOString(), isUserEdited: true, updateNoticeStatus: "reviewed" as const };
      return { ...state, extractedItemsById: { ...state.extractedItemsById, [item.id]: updatedItem }, pendingPlanUpdate: scheduleUpdateRecommendation(state, "삭제된 수업 일정을 반영해 주간계획을 자동으로 정리할게요.", [item.id], [item]) };
    }
    case "extraction/itemDeleted": {
      const item = state.extractedItemsById[action.payload.id];
      if (!item) return state;
      const { [item.id]: _deleted, ...extractedItemsById } = state.extractedItemsById;
      const hasPlannedTodo = Object.values(state.todosById).some((todo) => todo.sourceExtractedItemId === item.id && !todo.isCompleted);
      const detectedAt = demoInteractionClock.now().toISOString();
      return {
        ...state,
        extractedItemsById,
        extractedItemIdsByDocumentId: Object.fromEntries(Object.entries(state.extractedItemIdsByDocumentId).map(([documentId, ids]) => [documentId, ids.filter((id) => id !== item.id)])),
        pendingPlanUpdate: Object.keys(state.weeklyPlansById).length && hasPlannedTodo ? {
          id: `plan-update-deleted-${detectedAt}-${item.id}`,
          reasonKind: "schedule-updated",
          academicEventIds: [item.id],
          message: `${item.title} 삭제를 반영해 주간계획을 정리할게요.`,
          detectedAt,
          status: "pending",
          noticeStatus: "unread",
          previousAcademicEvents: [item],
        } : state.pendingPlanUpdate,
      };
    }
    case "extraction/confirmed": {
      const { items, deletedItemIds = [] } = action.payload;
      const deletedIds = new Set(deletedItemIds);
      const reviewedAt = demoInteractionClock.now().toISOString();
      const reviewedItems = items.map((item) => ({
        ...item,
        ...assessAcademicEventConfirmation(item),
        reviewStatus: "confirmed" as const,
        updateNoticeStatus: "reviewed" as const,
        updatedAt: reviewedAt,
      }));
      const confirmedDocumentIds = new Set([
        ...reviewedItems.flatMap((item) => item.sourceDocumentIds),
        ...deletedItemIds.flatMap((id) => state.extractedItemsById[id]?.sourceDocumentIds ?? []),
      ]);
      const retainedItems = Object.fromEntries(
        Object.entries(state.extractedItemsById).filter(([id]) => !deletedIds.has(id)),
      );
      const deletedPlannedIds = deletedItemIds.filter((id) => Object.values(state.todosById).some((todo) => todo.sourceExtractedItemId === id && !todo.isCompleted));
      const pendingPlanUpdate = Object.keys(state.weeklyPlansById).length
        ? state.pendingPlanUpdate ?? createPlanUpdateRecommendation(state.extractedItemsById, reviewedItems, reviewedAt) ?? (deletedPlannedIds.length ? {
          id: `plan-update-deleted-${reviewedAt}`,
          reasonKind: "schedule-updated" as const,
          academicEventIds: deletedPlannedIds,
          message: "변경된 학업 일정을 반영해 주간계획을 업데이트할까요?",
          detectedAt: reviewedAt,
          status: "pending" as const,
          noticeStatus: "unread" as const,
        } : state.pendingPlanUpdate)
        : state.pendingPlanUpdate;
      return {
        ...state,
        documentsById: Object.fromEntries(
          Object.entries(state.documentsById).map(([id, document]) => [
            id,
            confirmedDocumentIds.has(id) ? { ...document, extractionStatus: "complete" } : document,
          ]),
        ),
        extractedItemsById: {
          ...retainedItems,
          ...Object.fromEntries(reviewedItems.map((item) => [item.id, item])),
        },
        extractedItemIdsByDocumentId: Object.fromEntries(
          Object.entries(state.extractedItemIdsByDocumentId).map(([documentId, ids]) => [
            documentId,
            [...new Set([
              ...ids.filter((id) => !deletedIds.has(id)),
              ...reviewedItems.filter((item) => item.sourceDocumentIds.includes(documentId)).map((item) => item.id),
            ])],
          ]),
        ),
        pendingPlanUpdate,
      };
    }
    case "plan/applied": {
      const { operationId, weeklyPlan, todos } = action.payload;
      return {
        ...state,
        weeklyPlansById: {
          ...state.weeklyPlansById,
          [weeklyPlan.id]: {
            ...weeklyPlan,
            academicEventSnapshot: Object.fromEntries(Object.values(state.extractedItemsById).map((item) => [item.id, item.updatedAt])),
          },
        },
        todosById: {
          ...state.todosById,
          ...Object.fromEntries(todos.map((todo) => [todo.id, todo])),
        },
        todoIdsByWeeklyPlanId: {
          ...state.todoIdsByWeeklyPlanId,
          [weeklyPlan.id]: todos.map((todo) => todo.id),
        },
        appliedOperations: { ...state.appliedOperations, [operationId]: "plan" },
      };
    }
    case "planning/profileUpdated":
      return {
        ...state,
        planningProfile: {
          ...state.planningProfile,
          ...action.payload,
          confidenceByCourse: { ...state.planningProfile.confidenceByCourse, ...action.payload.confidenceByCourse },
          preparationByEventId: { ...state.planningProfile.preparationByEventId, ...action.payload.preparationByEventId },
          examGoalByEventId: { ...state.planningProfile.examGoalByEventId, ...action.payload.examGoalByEventId },
        },
      };
    case "plan/adjusted": {
      if (!action.payload.changed) return state;
      const currentPlan = Object.values(state.weeklyPlansById).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (!currentPlan) return state;
      const adjustment: PlanAdjustment = {
        id: `adjustment-${action.payload.operationId}`,
        weeklyPlanId: currentPlan.id,
        trigger: action.payload.trigger,
        requestText: action.payload.requestText,
        relatedAcademicEventIds: action.payload.relatedAcademicEventIds,
        changedTodoIds: action.payload.changedTodoIds,
        createdAt: demoInteractionClock.now().toISOString(),
        ...(action.payload.trigger === "NEW_ACADEMIC_INFORMATION" ? {
          beforeTodos: (state.todoIdsByWeeklyPlanId[currentPlan.id] ?? []).map((id) => state.todosById[id]).filter(Boolean),
          afterTodos: action.payload.todos,
          summary: action.payload.summary,
          diff: action.payload.diff,
          noticeStatus: "unread" as const,
        } : {}),
      };
      return {
        ...state,
        weeklyPlansById: {
          ...state.weeklyPlansById,
          [currentPlan.id]: {
            ...currentPlan,
            lastAdjustedAt: adjustment.createdAt,
            academicEventSnapshot: Object.fromEntries(Object.values(state.extractedItemsById).map((item) => [item.id, item.updatedAt])),
          },
        },
        todosById: {
          ...Object.fromEntries(Object.entries(state.todosById).filter(([id]) => !(state.todoIdsByWeeklyPlanId[currentPlan.id] ?? []).includes(id))),
          ...Object.fromEntries(action.payload.todos.map((todo) => [todo.id, todo])),
        },
        todoIdsByWeeklyPlanId: {
          ...state.todoIdsByWeeklyPlanId,
          [currentPlan.id]: action.payload.todos.map((todo) => todo.id),
        },
        adjustmentUsageByDate: {
          ...state.adjustmentUsageByDate,
          [action.payload.usageDate]: (state.adjustmentUsageByDate[action.payload.usageDate] ?? 0) + 1,
        },
        planAdjustmentsById: { ...state.planAdjustmentsById, [adjustment.id]: adjustment },
        pendingPlanUpdate: action.payload.trigger === "NEW_ACADEMIC_INFORMATION" ? null : state.pendingPlanUpdate,
        processedPlanUpdatesById: action.payload.trigger === "NEW_ACADEMIC_INFORMATION" && state.pendingPlanUpdate
          ? {
              ...state.processedPlanUpdatesById,
              [state.pendingPlanUpdate.id]: {
                ...state.pendingPlanUpdate,
                status: "processed",
                processedAt: adjustment.createdAt,
                outcome: "changed",
              },
            }
          : state.processedPlanUpdatesById,
        appliedOperations: {
          ...state.appliedOperations,
          [action.payload.operationId]: "adjustment",
        },
      };
    }
    case "plan/automaticUpdateUndone": {
      const adjustment = state.planAdjustmentsById[action.payload.adjustmentId];
      if (!adjustment || adjustment.trigger !== "NEW_ACADEMIC_INFORMATION" || adjustment.undoneAt || !adjustment.beforeTodos) return state;
      const currentPlan = state.weeklyPlansById[adjustment.weeklyPlanId];
      if (!currentPlan) return state;
      const currentIds = new Set(state.todoIdsByWeeklyPlanId[currentPlan.id] ?? []);
      const undoneAt = demoInteractionClock.now().toISOString();
      return {
        ...state,
        todosById: {
          ...Object.fromEntries(Object.entries(state.todosById).filter(([id]) => !currentIds.has(id))),
          ...Object.fromEntries(adjustment.beforeTodos.map((todo) => [todo.id, todo])),
        },
        todoIdsByWeeklyPlanId: { ...state.todoIdsByWeeklyPlanId, [currentPlan.id]: adjustment.beforeTodos.map((todo) => todo.id) },
        planAdjustmentsById: { ...state.planAdjustmentsById, [adjustment.id]: { ...adjustment, undoneAt, noticeStatus: "reviewed" } },
      };
    }
    case "plan/adjustmentNoticeReviewed": {
      const adjustment = state.planAdjustmentsById[action.payload.adjustmentId];
      if (!adjustment || adjustment.noticeStatus === "reviewed") return state;
      return { ...state, planAdjustmentsById: { ...state.planAdjustmentsById, [adjustment.id]: { ...adjustment, noticeStatus: "reviewed" } } };
    }
    case "plan/updateNoticeReviewed":
      return state.pendingPlanUpdate ? { ...state, pendingPlanUpdate: { ...state.pendingPlanUpdate, noticeStatus: "reviewed" } } : state;
    case "plan/updateDismissed":
    case "plan/updateProcessed": {
      if (!state.pendingPlanUpdate) return state;
      const outcome = action.type === "plan/updateDismissed" ? "dismissed" : action.payload.outcome;
      const processed = {
        ...state.pendingPlanUpdate,
        status: "processed" as const,
        processedAt: demoInteractionClock.now().toISOString(),
        outcome,
      };
      return {
        ...state,
        pendingPlanUpdate: null,
        processedPlanUpdatesById: {
          ...state.processedPlanUpdatesById,
          [processed.id]: processed,
        },
      };
    }
    case "extraction/updateReviewed": {
      const item = state.extractedItemsById[action.payload.id];
      if (!item || item.updateNoticeStatus === "reviewed") return state;
      return {
        ...state,
        extractedItemsById: {
          ...state.extractedItemsById,
          [item.id]: { ...item, updateNoticeStatus: "reviewed" },
        },
      };
    }
  }
}
