import { describe, expect, it } from "vitest";
import { createInitialPrototypeState, prototypeReducer } from "./prototypeReducer";
import type { ExtractionResult, GeneratePlanResult } from "../domain/types";
import { academicEventFixture } from "../test/academicEventFixture";

const extraction: ExtractionResult = {
  operationId: "extract-1",
  documents: [{
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
  }],
  extractedItems: [academicEventFixture({
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
  })],
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
    durationRationale: [],
    carriedOverFromTodoId: null,
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
  it("marks a no-change update processed without charging adjustment usage", () => {
    const initial = createInitialPrototypeState();
    initial.pendingPlanUpdate = {
      id: "update-1", reasonKind: "new-academic-event", academicEventIds: [], message: "업데이트", detectedAt: "2026-07-20T00:00:00Z",
      previousAcademicEvents: [], status: "pending",
    };
    const next = prototypeReducer(initial, { type: "plan/updateProcessed", payload: { outcome: "no-change" } });
    expect(next.pendingPlanUpdate).toBeNull();
    expect(next.processedPlanUpdatesById["update-1"]).toMatchObject({ status: "processed", outcome: "no-change" });
    expect(next.adjustmentUsageByDate).toEqual({});
  });
  it("stores an extraction result and its relation atomically", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    expect(state.documentsById["doc-1"]).toEqual(extraction.documents[0]);
    expect(state.extractedItemIdsByDocumentId["doc-1"]).toEqual(["item-1"]);
  });

  it("ignores an already applied plan operation", () => {
    const first = prototypeReducer(createInitialPrototypeState(), {
      type: "plan/applied",
      payload: plan,
    });
    expect(prototypeReducer(first, { type: "plan/applied", payload: plan })).toBe(first);
  });

  it("자동 계획 조정의 이전 상태를 보존하고 추가 횟수 차감 없이 되돌린다", () => {
    const withPlan = prototypeReducer(createInitialPrototypeState(), { type: "plan/applied", payload: plan });
    withPlan.pendingPlanUpdate = {
      id: "pending-auto", reasonKind: "assignment-updated", academicEventIds: ["item-1"], message: "자동 정리", detectedAt: "2026-07-20T10:00:00Z", status: "pending", noticeStatus: "unread",
    };
    const movedTodo = { ...plan.todos[0], scheduledDate: "2026-07-22" };
    const adjusted = prototypeReducer(withPlan, {
      type: "plan/adjusted",
      payload: { operationId: "auto-1", todos: [movedTodo], usageDate: "2026-07-20", changed: true, trigger: "NEW_ACADEMIC_INFORMATION", requestText: null, relatedAcademicEventIds: ["item-1"], changedTodoIds: ["todo-1"], summary: "수요일로 옮겼어요." },
    });
    const undone = prototypeReducer(adjusted, { type: "plan/automaticUpdateUndone", payload: { adjustmentId: "adjustment-auto-1" } });

    expect(adjusted.todosById["todo-1"].scheduledDate).toBe("2026-07-22");
    expect(adjusted.adjustmentUsageByDate["2026-07-20"]).toBe(1);
    expect(undone.todosById["todo-1"].scheduledDate).toBe("2026-07-20");
    expect(undone.adjustmentUsageByDate["2026-07-20"]).toBe(1);
    expect(undone.planAdjustmentsById["adjustment-auto-1"].undoneAt).toBeTruthy();
  });

  it("학업 일정 삭제는 원본과 문서 연결을 함께 제거한다", () => {
    const extracted = prototypeReducer(createInitialPrototypeState(), { type: "extraction/applied", payload: extraction });
    const deleted = prototypeReducer(extracted, { type: "extraction/itemDeleted", payload: { id: "item-1" } });
    expect(deleted.extractedItemsById["item-1"]).toBeUndefined();
    expect(deleted.extractedItemIdsByDocumentId["doc-1"]).toEqual([]);
  });

  it("confirms edited extracted items", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    const saved = prototypeReducer(state, {
      type: "extraction/confirmed",
      payload: {
        items: [{ ...extraction.extractedItems[0], reviewStatus: "confirmed" }],
      },
    });
    expect(saved.documentsById["doc-1"].extractionStatus).toBe("complete");
  });

  it("deletes reviewed extracted items and their document relations", () => {
    const state = prototypeReducer(createInitialPrototypeState(), {
      type: "extraction/applied",
      payload: extraction,
    });
    const saved = prototypeReducer(state, {
      type: "extraction/confirmed",
      payload: { items: [], deletedItemIds: ["item-1"] },
    });

    expect(saved.extractedItemsById["item-1"]).toBeUndefined();
    expect(saved.extractedItemIdsByDocumentId["doc-1"]).toEqual([]);
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

  it("edits and deletes a stored personal schedule regardless of its source label", () => {
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

    const updated = prototypeReducer(connected, {
      type: "calendar/eventUpdated",
      payload: { id: "google-1", ...eventDraft, title: "변경" },
    });
    const deleted = prototypeReducer(updated, {
      type: "calendar/eventDeleted",
      payload: { id: "google-1" },
    });
    expect(updated.calendarEventsById["google-1"].title).toBe("변경");
    expect(deleted.calendarEventsById["google-1"]).toBeUndefined();
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
