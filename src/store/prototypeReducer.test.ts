import { describe, expect, it } from "vitest";
import { createInitialPrototypeState, prototypeReducer } from "./prototypeReducer";
import type { ExtractionResult, GeneratePlanResult } from "../domain/types";

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
  extractedItems: [{
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
  }],
};

const plan: GeneratePlanResult = {
  operationId: "plan-1",
  weeklyPlan: {
    id: "weekly-plan-1",
    userId: "user-demo-01",
    planStartDate: "2026-07-22",
    planEndDate: "2026-07-28",
    status: "complete",
    createdAt: "2026-07-19T20:00:00+09:00",
    generationRequest: "오늘부터 7일 계획 짜줘",
    referenceWindowEndDate: "2026-08-16",
    summary: "계획",
  },
  todos: [{
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
  }],
  assistantMessage: {
    id: "assistant-plan-1",
    role: "assistant",
    text: "계획을 생성했어요.",
    createdAt: "2026-07-19T20:00:00+09:00",
    status: "sent",
  },
};

const eventDraft = {
  title: "스터디",
  date: "2026-07-25",
  startTime: "19:00",
  endTime: "20:00",
  isAllDay: false,
  eventType: "personal" as const,
};

describe("prototypeReducer", () => {
  it("stores an extraction result and its relation atomically", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    expect(state.documentsById["doc-1"]).toEqual(extraction.document);
    expect(state.extractedItemIdsByDocumentId["doc-1"]).toEqual(["item-1"]);
  });

  it("ignores an already applied plan operation", () => {
    const first = prototypeReducer(createInitialPrototypeState(), {
      type: "plan/applied",
      payload: plan,
    });
    expect(prototypeReducer(first, { type: "plan/applied", payload: plan })).toBe(first);
  });

  it("confirms edited extracted items", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    const saved = prototypeReducer(state, {
      type: "extraction/confirmed",
      payload: {
        documentId: "doc-1",
        items: [{ ...extraction.extractedItems[0], reviewStatus: "confirmed" }],
      },
    });
    expect(saved.documentsById["doc-1"].extractionStatus).toBe("complete");
  });

  it("updates editable fields on one extracted schedule", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    const updated = prototypeReducer(state, {
      type: "extraction/itemUpdated",
      payload: {
        id: "item-1",
        title: "수정된 일정",
        date: "2026-07-24",
        time: "14:00",
      },
    });

    expect(updated.extractedItemsById["item-1"]).toMatchObject({
      title: "수정된 일정",
      date: "2026-07-24",
      time: "14:00",
      documentId: "doc-1",
      itemType: "assignment",
    });
  });

  it("creates, updates, and deletes a CatchUp event", () => {
    const created = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/eventCreated",
      payload: { id: "event-1", ...eventDraft },
    });
    const updated = prototypeReducer(created, {
      type: "calendar/eventUpdated",
      payload: { id: "event-1", ...eventDraft, title: "수정한 스터디" },
    });
    const deleted = prototypeReducer(updated, {
      type: "calendar/eventDeleted",
      payload: { id: "event-1" },
    });

    expect(created.calendarEventsById["event-1"].source).toBe("catchup");
    expect(updated.calendarEventsById["event-1"].title).toBe("수정한 스터디");
    expect(deleted.calendarEventsById["event-1"]).toBeUndefined();
  });

  it("does not edit or delete Google Calendar events", () => {
    const googleEvent = {
      id: "google-1",
      userId: "user-demo-01",
      ...eventDraft,
      source: "google-calendar" as const,
      updatedAt: "2026-07-01T00:00:00+09:00",
    };
    const connected = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/connectionSucceeded",
      payload: { events: [googleEvent] },
    });

    expect(prototypeReducer(connected, {
      type: "calendar/eventUpdated",
      payload: { id: "google-1", ...eventDraft, title: "변경" },
    })).toBe(connected);
    expect(prototypeReducer(connected, {
      type: "calendar/eventDeleted",
      payload: { id: "google-1" },
    })).toBe(connected);
  });

  it("stores a color override for the whole calendar category", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "calendar/categoryColorSet",
      payload: {
        categoryKey: "course:데이터베이스",
        color: "#A5D1FF",
      },
    });

    expect(state.categoryColorByKey).toEqual({
      "course:데이터베이스": "#A5D1FF",
    });
  });
});
