import type {
  CalendarEvent,
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
import { demoCalendarEvents, demoUser } from "../mocks/templates";

export interface PrototypeState {
  user: User;
  documentsById: Record<DocumentId, UploadedDocument>;
  extractedItemsById: Record<ExtractedItemId, ExtractedItem>;
  extractedItemIdsByDocumentId: Record<DocumentId, ExtractedItemId[]>;
  calendarEventsById: Record<string, CalendarEvent>;
  weeklyPlansById: Record<WeeklyPlanId, WeeklyPlan>;
  todosById: Record<TodoId, Todo>;
  todoIdsByWeeklyPlanId: Record<WeeklyPlanId, TodoId[]>;
  adjustmentUsageByDate: Record<string, number>;
  appliedOperations: Record<OperationId, "extraction" | "plan" | "adjustment">;
}

export type PrototypeAction =
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
    documentsById: {},
    extractedItemsById: {},
    extractedItemIdsByDocumentId: {},
    calendarEventsById: Object.fromEntries(
      demoCalendarEvents.map((event) => [event.id, { ...event }]),
    ),
    weeklyPlansById: {},
    todosById: {},
    todoIdsByWeeklyPlanId: {},
    adjustmentUsageByDate: {},
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
