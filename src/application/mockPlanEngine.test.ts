import { describe, expect, it } from "vitest";
import { generateMockWeeklyPlan } from "./mockPlanEngine";
import type { GeneratePlanCommand } from "../domain/types";

const command: GeneratePlanCommand = {
  operationId: "op-generate-1",
  requestedAt: "2026-07-19T20:00:00+09:00",
  requestText: "수요일은 가볍게, 일요일에는 쉬는 시간을 많이 확보해줘.",
  user: {
    id: "user-demo-01",
    displayName: "테스트 학생",
    calendarConnectionStatus: "connected",
    weeklyPlanGenerationDay: 0,
    weeklyPlanGenerationTime: "20:00",
    planGenerationRequest: "",
  },
  documents: [
    {
      id: "doc-runtime-1",
      userId: "user-demo-01",
      fileName: "강의계획서.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2_400_000,
      documentType: "syllabus",
      supportedFileFormat: "pdf",
      uploadStatus: "complete",
      extractionStatus: "complete",
      uploadedAt: "2026-07-19T20:00:00+09:00",
    },
  ],
  extractedItems: [
    {
      id: "item-runtime-1",
      documentId: "doc-runtime-1",
      title: "UX 리서치 보고서",
      itemType: "assignment",
      courseName: "UX 디자인",
      date: "2026-07-23",
      time: "23:59",
      submissionMethod: "LMS",
      requiredMaterials: "보고서 PDF",
      difficulty: "high",
      estimatedDurationMinutes: 180,
      reviewStatus: "confirmed",
      isUserEdited: true,
    },
  ],
  calendarEvents: [
    {
      id: "calendar-1",
      userId: "user-demo-01",
      title: "동아리 모임",
      date: "2026-07-22",
      startTime: "17:00",
      endTime: "20:00",
      isAllDay: false,
      source: "google-calendar",
      updatedAt: "2026-07-01T00:00:00+09:00",
    },
  ],
  existingWeeklyPlan: null,
};

describe("generateMockWeeklyPlan", () => {
  it("creates deterministic todos linked to runtime extracted item ids", () => {
    const first = generateMockWeeklyPlan(command);
    const second = generateMockWeeklyPlan(command);

    expect(first).toEqual(second);
    expect(first.todos).toHaveLength(2);
    expect(first.todos.every((todo) => todo.sourceExtractedItemId === "item-runtime-1")).toBe(true);
    expect(first.todos.every((todo) => todo.weeklyPlanId === first.weeklyPlan.id)).toBe(true);
  });

  it("keeps a calendar-heavy Wednesday light", () => {
    const result = generateMockWeeklyPlan(command);
    const wednesdayMinutes = result.todos
      .filter((todo) => todo.scheduledDate === "2026-07-22")
      .reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0);

    expect(wednesdayMinutes).toBeLessThanOrEqual(60);
  });
});
