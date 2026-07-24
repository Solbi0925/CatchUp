import { describe, expect, it } from "vitest";
import {
  createInitialPrototypeState,
  prototypeReducer,
  type CreateCalendarEventPayload,
  type UpdateCalendarEventPayload,
} from "./prototypeReducer";
import type { CalendarEvent, ExtractionResult, GeneratePlanResult } from "../domain/types";

const extraction: ExtractionResult = {
  operationId: "extract-1",
  document: {
    id: "doc-1",
    userId: "user-demo-01",
    fileName: "강의계획서.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    documentType: "syllabus",
    supportedFileFormat: "pdf",
    uploadStatus: "complete",
    extractionStatus: "needs-review",
    uploadedAt: "2026-07-19T20:00:00+09:00",
  },
  extractedItems: [
    {
      id: "item-1",
      documentId: "doc-1",
      title: "보고서",
      itemType: "assignment",
      courseName: "UX 디자인",
      date: "2026-07-23",
      time: "23:59",
      submissionMethod: "LMS",
      requiredMaterials: "PDF",
      difficulty: "high",
      estimatedDurationMinutes: 180,
      reviewStatus: "needs-review",
      isUserEdited: false,
    },
  ],
};

const plan: GeneratePlanResult = {
  operationId: "plan-1",
  weeklyPlan: {
    id: "weekly-plan-1",
    userId: "user-demo-01",
    weekStartDate: "2026-07-20",
    weekEndDate: "2026-07-26",
    status: "complete",
    createdAt: "2026-07-19T20:00:00+09:00",
    generationRequest: "이번 주 계획 짜줘",
    referenceWindowEndDate: "2026-08-16",
    summary: "계획",
  },
  todos: [
    {
      id: "todo-1",
      weeklyPlanId: "weekly-plan-1",
      sourceExtractedItemId: "item-1",
      scheduledDate: "2026-07-20",
      title: "보고서 시작",
      todoType: "assignment-work",
      courseName: "UX 디자인",
      estimatedDurationMinutes: 90,
      priority: "high",
      isCompleted: false,
      recommendationReason: "마감이 가까워요.",
    },
  ],
  assistantMessage: {
    id: "assistant-plan-1",
    role: "assistant",
    text: "계획을 생성했어요.",
    createdAt: "2026-07-19T20:00:00+09:00",
    status: "sent",
  },
};

const calendarEventFields = {
  title: "스터디 약속",
  date: "2026-07-21",
  startTime: "19:00",
  endTime: "20:00",
  isAllDay: false,
  eventType: "personal" as const,
};

function googleEvent(id: string, title = "Google 일정"): CalendarEvent {
  return {
    id,
    userId: "user-demo-01",
    title,
    date: "2026-07-21",
    startTime: "09:00",
    endTime: "10:00",
    isAllDay: false,
    eventType: "personal",
    source: "google-calendar",
    updatedAt: "2026-07-01T09:00:00+09:00",
  };
}

function createCatchUpEvent() {
  return prototypeReducer(createInitialPrototypeState(), {
    type: "calendar/eventCreated",
    payload: { id: "catchup-event-1", ...calendarEventFields },
  });
}

const untrustedCalendarEvent = googleEvent("untrusted-event");

// @ts-expect-error Calendar records cannot be reused as CatchUp create commands.
const forgedCreatePayload: CreateCalendarEventPayload = untrustedCalendarEvent;
// @ts-expect-error Calendar records cannot be reused as CatchUp update commands.
const forgedUpdatePayload: UpdateCalendarEventPayload = untrustedCalendarEvent;

void forgedCreatePayload;
void forgedUpdatePayload;

describe("prototypeReducer", () => {
  it("stores an extraction result and its relation atomically", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });

    expect(state.documentsById["doc-1"]).toEqual(extraction.document);
    expect(state.extractedItemsById["item-1"]).toEqual(extraction.extractedItems[0]);
    expect(state.extractedItemIdsByDocumentId["doc-1"]).toEqual(["item-1"]);
  });

  it("ignores an already applied plan operation", () => {
    const initial = createInitialPrototypeState();
    const first = prototypeReducer(initial, { type: "plan/applied", payload: plan });
    const second = prototypeReducer(first, { type: "plan/applied", payload: plan });

    expect(second).toBe(first);
    expect(second.todoIdsByWeeklyPlanId["weekly-plan-1"]).toEqual(["todo-1"]);
  });

  it("confirms edited extracted items and completes the document", () => {
    const extracted = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    const saved = prototypeReducer(extracted, {
      type: "extraction/confirmed",
      payload: {
        documentId: "doc-1",
        items: [{ ...extraction.extractedItems[0], reviewStatus: "confirmed", isUserEdited: true }],
      },
    });

    expect(saved.documentsById["doc-1"].extractionStatus).toBe("complete");
    expect(saved.extractedItemsById["item-1"].reviewStatus).toBe("confirmed");
  });

  it("creates a CatchUp event with the current user, source, and interaction time", () => {
    const state = createCatchUpEvent();

    expect(state.calendarEventsById["catchup-event-1"]).toEqual({
      id: "catchup-event-1",
      userId: "user-demo-01",
      ...calendarEventFields,
      source: "catchup",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("does not let a malformed create payload overwrite CatchUp ownership", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/eventCreated",
      payload: {
        id: "malformed-create-event",
        ...calendarEventFields,
        userId: undefined,
        source: undefined,
        updatedAt: undefined,
      } as unknown as CreateCalendarEventPayload,
    });

    expect(state.calendarEventsById["malformed-create-event"]).toMatchObject({
      id: "malformed-create-event",
      userId: "user-demo-01",
      source: "catchup",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("updates only editable fields on a CatchUp event", () => {
    const created = createCatchUpEvent();
    const updated = prototypeReducer(created, {
      type: "calendar/eventUpdated",
      payload: {
        id: "catchup-event-1",
        title: "스터디 장소 변경",
        date: "2026-07-22",
        startTime: null,
        endTime: null,
        isAllDay: true,
        eventType: "class",
      },
    });

    expect(updated.calendarEventsById["catchup-event-1"]).toEqual({
      id: "catchup-event-1",
      userId: "user-demo-01",
      title: "스터디 장소 변경",
      date: "2026-07-22",
      startTime: null,
      endTime: null,
      isAllDay: true,
      eventType: "class",
      source: "catchup",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("does not let a malformed update payload overwrite CatchUp ownership", () => {
    const created = createCatchUpEvent();
    const updated = prototypeReducer(created, {
      type: "calendar/eventUpdated",
      payload: {
        id: "catchup-event-1",
        ...calendarEventFields,
        title: "위변조된 수정 요청",
        userId: undefined,
        source: undefined,
        updatedAt: undefined,
      } as unknown as UpdateCalendarEventPayload,
    });

    expect(updated.calendarEventsById["catchup-event-1"]).toMatchObject({
      id: "catchup-event-1",
      userId: "user-demo-01",
      title: "위변조된 수정 요청",
      source: "catchup",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("deletes a CatchUp event", () => {
    const deleted = prototypeReducer(createCatchUpEvent(), {
      type: "calendar/eventDeleted",
      payload: { id: "catchup-event-1" },
    });

    expect(deleted.calendarEventsById["catchup-event-1"]).toBeUndefined();
  });

  it("leaves missing and Google calendar update or delete requests unchanged", () => {
    const initial = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/connectionSucceeded",
      payload: { events: [googleEvent("google-event-1")] },
    });
    const updateMissing = prototypeReducer(initial, {
      type: "calendar/eventUpdated",
      payload: { id: "missing", ...calendarEventFields },
    });
    const deleteMissing = prototypeReducer(initial, {
      type: "calendar/eventDeleted",
      payload: { id: "missing" },
    });
    const updateGoogle = prototypeReducer(initial, {
      type: "calendar/eventUpdated",
      payload: { id: "google-event-1", ...calendarEventFields },
    });
    const deleteGoogle = prototypeReducer(initial, {
      type: "calendar/eventDeleted",
      payload: { id: "google-event-1" },
    });

    expect(updateMissing).toBe(initial);
    expect(deleteMissing).toBe(initial);
    expect(updateGoogle).toBe(initial);
    expect(deleteGoogle).toBe(initial);
  });

  it("accepts only Google events on reconnect and lets an existing CatchUp ID win collisions", () => {
    const connected = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/connectionSucceeded",
      payload: { events: [googleEvent("google-event-old")] },
    });
    const withCatchUpEvent = prototypeReducer(connected, {
      type: "calendar/eventCreated",
      payload: { id: "shared-event-id", ...calendarEventFields },
    });
    const payloadCatchUpEvent = {
      ...withCatchUpEvent.calendarEventsById["shared-event-id"],
      id: "payload-catchup-event",
    };
    const reconnected = prototypeReducer(withCatchUpEvent, {
      type: "calendar/connectionSucceeded",
      payload: {
        events: [
          googleEvent("shared-event-id", "Google이 덮어쓰려는 일정"),
          googleEvent("google-event-new", "새 Google 일정"),
          payloadCatchUpEvent,
        ],
      },
    });

    expect(reconnected.calendarEventsById["google-event-old"]).toBeUndefined();
    expect(reconnected.calendarEventsById["google-event-new"]).toEqual(
      googleEvent("google-event-new", "새 Google 일정"),
    );
    expect(reconnected.calendarEventsById["shared-event-id"]).toEqual(
      withCatchUpEvent.calendarEventsById["shared-event-id"],
    );
    expect(reconnected.calendarEventsById["payload-catchup-event"]).toBeUndefined();
  });

  it("removes Google events on onboarding skip while preserving CatchUp events", () => {
    const connected = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/connectionSucceeded",
      payload: { events: [googleEvent("google-event-1")] },
    });
    const withCatchUpEvent = prototypeReducer(connected, {
      type: "calendar/eventCreated",
      payload: { id: "catchup-event-1", ...calendarEventFields },
    });
    const skipped = prototypeReducer(withCatchUpEvent, {
      type: "calendar/onboardingSkipped",
      payload: {},
    });

    expect(skipped.calendarEventsById["google-event-1"]).toBeUndefined();
    expect(skipped.calendarEventsById["catchup-event-1"]).toEqual(
      withCatchUpEvent.calendarEventsById["catchup-event-1"],
    );
  });

  it("does not change Todo or WeeklyPlan collections through calendar CRUD", () => {
    const withPlan = prototypeReducer(createInitialPrototypeState(), {
      type: "plan/applied",
      payload: plan,
    });
    const created = prototypeReducer(withPlan, {
      type: "calendar/eventCreated",
      payload: { id: "catchup-event-1", ...calendarEventFields },
    });
    const updated = prototypeReducer(created, {
      type: "calendar/eventUpdated",
      payload: { id: "catchup-event-1", ...calendarEventFields, title: "수정한 스터디 약속" },
    });
    const deleted = prototypeReducer(updated, {
      type: "calendar/eventDeleted",
      payload: { id: "catchup-event-1" },
    });

    for (const state of [created, updated, deleted]) {
      expect(state.todosById).toBe(withPlan.todosById);
      expect(state.todoIdsByWeeklyPlanId).toBe(withPlan.todoIdsByWeeklyPlanId);
      expect(state.weeklyPlansById).toBe(withPlan.weeklyPlansById);
      expect(state.appliedOperations).toBe(withPlan.appliedOperations);
    }
  });
});
