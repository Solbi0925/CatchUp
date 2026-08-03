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
} from "../domain/types";
import { demoInteractionClock } from "../application/clock";
import { demoUser } from "../mocks/templates";
import type { CalendarCategoryColor } from "../features/calendar/calendarColors";

type EditableCalendarEventFields = Pick<
  CalendarEvent,
  "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType"
>;
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
  categoryColorByKey: Record<string, CalendarCategoryColor>;
  appliedOperations: Record<OperationId, "extraction" | "plan" | "adjustment">;
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
      type: "extraction/confirmed";
      payload: { documentId: DocumentId; items: ExtractedItem[] };
    }
  | { type: "plan/applied"; payload: GeneratePlanResult }
  | {
      type: "plan/adjusted";
      payload: { operationId: OperationId; todos: Todo[]; usageDate: string; changed: boolean };
    };

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
    categoryColorByKey: {},
    appliedOperations: {},
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
      };
    }
    case "calendar/eventUpdated": {
      const existingEvent = state.calendarEventsById[action.payload.id];
      if (!existingEvent || existingEvent.source !== "catchup") return state;
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
      };
    }
    case "calendar/eventDeleted": {
      const existingEvent = state.calendarEventsById[action.payload.id];
      if (!existingEvent || existingEvent.source !== "catchup") return state;
      const { [action.payload.id]: _deletedEvent, ...calendarEventsById } = state.calendarEventsById;
      return { ...state, calendarEventsById };
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
      const { document, extractedItems, operationId } = action.payload;
      return {
        ...state,
        documentsById: { ...state.documentsById, [document.id]: document },
        extractedItemsById: {
          ...state.extractedItemsById,
          ...Object.fromEntries(extractedItems.map((item) => [item.id, item])),
        },
        extractedItemIdsByDocumentId: {
          ...state.extractedItemIdsByDocumentId,
          [document.id]: extractedItems.map((item) => item.id),
        },
        appliedOperations: {
          ...state.appliedOperations,
          [operationId]: "extraction",
        },
      };
    }
    case "extraction/confirmed": {
      const { documentId, items } = action.payload;
      const document = state.documentsById[documentId];
      if (!document) return state;
      return {
        ...state,
        documentsById: {
          ...state.documentsById,
          [documentId]: { ...document, extractionStatus: "complete" },
        },
        extractedItemsById: {
          ...state.extractedItemsById,
          ...Object.fromEntries(items.map((item) => [item.id, item])),
        },
      };
    }
    case "plan/applied": {
      const { operationId, weeklyPlan, todos } = action.payload;
      return {
        ...state,
        weeklyPlansById: { ...state.weeklyPlansById, [weeklyPlan.id]: weeklyPlan },
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
    case "plan/adjusted": {
      if (!action.payload.changed) return state;
      return {
        ...state,
        todosById: {
          ...state.todosById,
          ...Object.fromEntries(action.payload.todos.map((todo) => [todo.id, todo])),
        },
        adjustmentUsageByDate: {
          ...state.adjustmentUsageByDate,
          [action.payload.usageDate]: (state.adjustmentUsageByDate[action.payload.usageDate] ?? 0) + 1,
        },
        appliedOperations: {
          ...state.appliedOperations,
          [action.payload.operationId]: "adjustment",
        },
      };
    }
  }
}
