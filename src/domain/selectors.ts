import type { DocumentId, WeeklyPlan } from "./types";
import type { PrototypeState } from "../store/prototypeReducer";

export function selectDocuments(state: PrototypeState) {
  return Object.values(state.documentsById).sort((left, right) =>
    right.uploadedAt.localeCompare(left.uploadedAt),
  );
}

export function selectExtractedItemsForDocument(state: PrototypeState, documentId: DocumentId) {
  return (state.extractedItemIdsByDocumentId[documentId] ?? [])
    .map((itemId) => state.extractedItemsById[itemId])
    .filter((item) => item !== undefined);
}

export function selectAllExtractedItems(state: PrototypeState) {
  return Object.values(state.extractedItemsById);
}

export function selectCalendarEvents(state: PrototypeState) {
  return Object.values(state.calendarEventsById);
}

export function selectCurrentWeeklyPlan(state: PrototypeState): WeeklyPlan | null {
  return Object.values(state.weeklyPlansById)[0] ?? null;
}

export function selectTodosForCurrentPlan(state: PrototypeState) {
  const plan = selectCurrentWeeklyPlan(state);
  if (!plan) return [];
  return (state.todoIdsByWeeklyPlanId[plan.id] ?? [])
    .map((todoId) => state.todosById[todoId])
    .filter((todo) => todo !== undefined);
}
