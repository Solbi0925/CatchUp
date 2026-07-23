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
});
