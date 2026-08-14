import { describe, expect, it } from "vitest";
import { generateMockWeeklyPlan } from "./mockPlanEngine";
import type { GeneratePlanCommand } from "../domain/types";
import { academicEventFixture } from "../test/academicEventFixture";

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
    academicEventFixture({
      id: "item-runtime-1",
      documentId: "doc-runtime-1",
      sourceDocumentIds: ["doc-runtime-1"],
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
    }),
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
      eventType: "personal",
      source: "google-calendar",
      updatedAt: "2026-07-01T00:00:00+09:00",
    },
  ],
  existingWeeklyPlan: null,
  existingIncompleteTodos: [],
  planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: { "UX 디자인": "medium" }, pace: "average", preparationByEventId: {}, examGoalByEventId: {} },
};

describe("generateMockWeeklyPlan", () => {
  it("creates deterministic todos linked to runtime extracted item ids", () => {
    const first = generateMockWeeklyPlan(command);
    const second = generateMockWeeklyPlan(command);

    expect(first).toEqual(second);
    expect(first.todos).toHaveLength(3);
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

  it("uses an exam week without inventing an exact schedule date", () => {
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [academicEventFixture({
      id: "week-only-exam", title: "8주차 중간고사", itemType: "exam", date: null,
      scheduledWeek: 8, scheduledWeekLabel: "8주차", examScope: null,
      confirmationStatus: "unconfirmed", confirmationIssues: ["missing-date", "missing-exam-scope"],
      reviewStatus: "confirmed", estimatedDurationMinutes: null,
    })] });
    expect(result.todos.length).toBeGreaterThan(0);
    expect(result.todos.every((todo) => todo.title.includes("현재까지"))).toBe(true);
    expect(result.todos.every((todo) => todo.recommendationReason.includes("8주차"))).toBe(true);
  });

  it("carries over incomplete work and tracks the duration evidence", () => {
    const previous = { ...generateMockWeeklyPlan(command).todos[0], id: "old-todo", isCompleted: false };
    const result = generateMockWeeklyPlan({ ...command, existingIncompleteTodos: [previous] });
    expect(result.todos.some((todo) => todo.carriedOverFromTodoId === "old-todo")).toBe(true);
    expect(result.todos.every((todo) => todo.durationRationale.length > 0)).toBe(true);
    expect(result.assistantMessage.text).toContain("기존 미완료 항목");
  });
});
