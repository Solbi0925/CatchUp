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
  it("excludes past AcademicEvents from the four-week horizon", () => {
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [academicEventFixture({
      id: "past-event", title: "지난 과제", date: "2026-07-18", estimatedDurationMinutes: 180,
    })] });
    expect(result.validationError).toBeUndefined();
    expect(result.todos).toEqual([]);
  });

  it("uses daily study capacity without counting a time-unknown event as occupied time", () => {
    const timeUnknown = academicEventFixture({ id: "time-unknown", title: "시간 미정 시험", itemType: "exam", date: "2026-07-22", time: null, examScope: "1~4주차", estimatedDurationMinutes: 180, difficulty: "unknown" });
    const result = generateMockWeeklyPlan({
      ...command,
      extractedItems: [timeUnknown],
      calendarEvents: [],
      planningProfile: { ...command.planningProfile, maxDailyStudyMinutes: 240 } as GeneratePlanCommand["planningProfile"],
    });
    expect(result.validationError).toBeUndefined();
    expect(result.todos.reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0)).toBe(180);
  });

  it("lowers effective study capacity on a day filled with timed schedules", () => {
    const event = academicEventFixture({ id: "capacity-event", date: "2026-07-26", estimatedDurationMinutes: 180, difficulty: "unknown" });
    const result = generateMockWeeklyPlan({
      ...command,
      extractedItems: [event],
      planningProfile: { ...command.planningProfile, maxDailyStudyMinutes: 240 } as GeneratePlanCommand["planningProfile"],
      calendarEvents: [{
        id: "long-class", userId: command.user.id, title: "긴 수업과 일정", date: "2026-07-20", startTime: "08:00", endTime: "18:00",
        isAllDay: false, eventType: "class", source: "catchup", updatedAt: command.requestedAt,
      }],
    });
    const mondayMinutes = result.todos.filter((todo) => todo.scheduledDate === "2026-07-20").reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0);
    expect(mondayMinutes).toBeLessThanOrEqual(120);
    expect(result.todos.reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0)).toBe(180);
  });

  it("defers a four-week-away event when this week's real capacity is full", () => {
    const future = academicEventFixture({ id: "future-large", title: "4주 뒤 큰 과제", date: "2026-08-15", estimatedDurationMinutes: 360, difficulty: "unknown" });
    const calendarEvents = Array.from({ length: 7 }, (_, index) => ({
      id: `full-${index}`, userId: command.user.id, title: "종일 일정", date: new Date(Date.UTC(2026, 6, 19 + index)).toISOString().slice(0, 10),
      startTime: null, endTime: null, isAllDay: true, eventType: "personal" as const, source: "catchup" as const, updatedAt: command.requestedAt,
    }));
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [future], calendarEvents, planningProfile: { ...command.planningProfile, maxDailyStudyMinutes: 240 } as GeneratePlanCommand["planningProfile"] });
    expect(result.validationError).toBeUndefined();
    expect(result.todos).toEqual([]);
  });

  it("starts only an early portion of a four-week-away event when capacity is available", () => {
    const future = academicEventFixture({ id: "future-start", title: "4주 뒤 큰 과제", date: "2026-08-15", estimatedDurationMinutes: 360, difficulty: "unknown" });
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [future], calendarEvents: [], planningProfile: { ...command.planningProfile, maxDailyStudyMinutes: 240 } as GeneratePlanCommand["planningProfile"] });
    const minutes = result.todos.reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0);
    expect(minutes).toBeGreaterThan(0);
    expect(minutes).toBeLessThan(360);
    expect(result.todos[0].taskPhase).toBe("research");
  });

  it("preserves the full estimate when a 3-hour task must be split around 1-hour daily capacity", () => {
    const event = academicEventFixture({ id: "split-work", date: "2026-07-26", estimatedDurationMinutes: 180, difficulty: "unknown" });
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [event], calendarEvents: [], planningProfile: { ...command.planningProfile, maxDailyStudyMinutes: 60 } as GeneratePlanCommand["planningProfile"] });
    expect(result.validationError).toBeUndefined();
    expect(result.todos.reduce((sum, todo) => sum + todo.estimatedDurationMinutes, 0)).toBe(180);
    expect(result.todos.every((todo) => todo.estimatedDurationMinutes <= 60)).toBe(true);
  });

  it("carries over only incomplete work whose source event is still valid", () => {
    const valid = academicEventFixture({ id: "valid", date: "2026-07-26", estimatedDurationMinutes: 60, difficulty: "unknown" });
    const expired = academicEventFixture({ id: "expired", date: "2026-07-18", estimatedDurationMinutes: 60, difficulty: "unknown" });
    const previous = generateMockWeeklyPlan({ ...command, extractedItems: [valid] }).todos[0];
    const expiredTodo = { ...previous, id: "expired-todo", sourceExtractedItemId: expired.id, title: "기한 지난 작업", carriedOverFromTodoId: null };
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [valid, expired], existingIncompleteTodos: [{ ...previous, id: "valid-todo" }, expiredTodo] });
    expect(result.todos.some((todo) => todo.carriedOverFromTodoId === "valid-todo")).toBe(true);
    expect(result.todos.some((todo) => todo.carriedOverFromTodoId === "expired-todo" || todo.sourceExtractedItemId === "expired")).toBe(false);
  });
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

  it("excludes an unconfirmed week-only exam from plan generation", () => {
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [academicEventFixture({
      id: "week-only-exam", title: "8주차 중간고사", itemType: "exam", date: null,
      scheduledWeek: 8, scheduledWeekLabel: "8주차", examScope: null,
      confirmationStatus: "unconfirmed", confirmationIssues: ["missing-date", "missing-exam-scope"],
      reviewStatus: "confirmed", estimatedDurationMinutes: null,
    })] });
    expect(result.todos).toEqual([]);
  });

  it("carries over incomplete work and tracks the duration evidence", () => {
    const previous = { ...generateMockWeeklyPlan(command).todos[0], id: "old-todo", isCompleted: false };
    const result = generateMockWeeklyPlan({ ...command, existingIncompleteTodos: [previous] });
    expect(result.todos.some((todo) => todo.carriedOverFromTodoId === "old-todo")).toBe(true);
    expect(result.todos.every((todo) => todo.durationRationale.length > 0)).toBe(true);
    expect(result.assistantMessage.text).toContain("기존 미완료 항목");
  });

  it("creates minimum review tasks from a confirmed timetable when no confirmed event is planable", () => {
    const result = generateMockWeeklyPlan({ ...command, extractedItems: [academicEventFixture({
      id: "timetable", itemType: "class-schedule", title: "도시건축 수업", courseName: "도시건축",
      date: null, confirmationStatus: "confirmed", classMeetingTimes: [{ id: "monday", weekday: 1, startTime: "10:30", endTime: "11:45", location: "401-930" }],
    })] });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0]).toMatchObject({ title: "도시건축 수업 내용 복습하기", estimatedDurationMinutes: 45 });
  });

  it("post-validates weekday task limits for timetable review tasks", () => {
    const result = generateMockWeeklyPlan({ ...command, requestText: "주간계획 생성해줘. 목요일과 금요일 할 일 1개 이하", extractedItems: [academicEventFixture({
      id: "timetable-limits", itemType: "class-schedule", title: "스튜디오 수업", courseName: "스튜디오", date: null, confirmationStatus: "confirmed",
      classMeetingTimes: [{ id: "thu-1", weekday: 4, startTime: "09:00", endTime: "10:00", location: null }, { id: "thu-2", weekday: 4, startTime: "11:00", endTime: "12:00", location: null }, { id: "fri", weekday: 5, startTime: "09:00", endTime: "10:00", location: null }],
    })] });
    expect(result.validationError).toBeUndefined();
    expect(result.todos.filter((todo) => new Date(`${todo.scheduledDate}T00:00:00Z`).getUTCDay() === 4)).toHaveLength(1);
    expect(result.todos.filter((todo) => new Date(`${todo.scheduledDate}T00:00:00Z`).getUTCDay() === 5)).toHaveLength(1);
  });
});
