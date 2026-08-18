import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { generateMockWeeklyPlan } from "./mockPlanEngine";
import { updateMockPlan } from "./updatePlan";
import { demoUser } from "../mocks/templates";

describe("updateMockPlan", () => {
  it("keeps completed work and refreshes only affected event tasks", () => {
    const event = academicEventFixture({ id: "exam", itemType: "exam", date: "2026-07-26", examScope: "1~7주차", estimatedDurationMinutes: 180, reviewStatus: "confirmed" });
    const command = { operationId: "generate", requestedAt: "2026-07-20T09:00:00+09:00", requestText: "주간계획 생성", user: demoUser, documents: [], extractedItems: [event], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} } };
    const initial = generateMockWeeklyPlan(command);
    const completed = { ...initial.todos[0], isCompleted: true };
    const result = updateMockPlan({ command: { ...command, operationId: "update" }, weeklyPlan: initial.weeklyPlan, todos: [completed, ...initial.todos.slice(1)], affectedAcademicEventIds: ["exam"] });
    expect(result.todos.find((todo) => todo.id === completed.id)?.isCompleted).toBe(true);
    expect(result.todos.filter((todo) => todo.isCompleted)).toHaveLength(1);
  });

  it("새 개인 일정과 겹치는 미완료 할 일만 다른 날로 옮긴다", () => {
    const event = academicEventFixture({ id: "report", date: "2026-07-26", estimatedDurationMinutes: 60, reviewStatus: "confirmed" });
    const command = { operationId: "generate-personal", requestedAt: "2026-07-20T09:00:00+09:00", requestText: "주간계획 생성", user: demoUser, documents: [], extractedItems: [event], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} } };
    const initial = generateMockWeeklyPlan(command);
    const collisionDate = initial.todos[0].scheduledDate;
    const result = updateMockPlan({ command: { ...command, operationId: "personal-update", calendarEvents: [{ id: "personal", userId: demoUser.id, title: "약속", date: collisionDate, startTime: "09:00", endTime: "18:00", isAllDay: false, eventType: "personal", source: "catchup", updatedAt: command.requestedAt }] }, weeklyPlan: initial.weeklyPlan, todos: initial.todos, affectedAcademicEventIds: [] });
    expect(result.changed).toBe(true);
    expect(result.todos[0].scheduledDate).not.toBe(collisionDate);
    expect(result.assistantMessage.text).toContain("새 개인 일정");
  });

  it("삭제된 AcademicEvent에 연결된 미완료 할 일을 중복 생성 없이 제거한다", () => {
    const event = academicEventFixture({ id: "deleted-event", date: "2026-07-26", estimatedDurationMinutes: 60, reviewStatus: "confirmed" });
    const command = { operationId: "generate-delete", requestedAt: "2026-07-20T09:00:00+09:00", requestText: "주간계획 생성", user: demoUser, documents: [], extractedItems: [event], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} } };
    const initial = generateMockWeeklyPlan(command);
    const result = updateMockPlan({ command: { ...command, operationId: "delete-update", extractedItems: [] }, weeklyPlan: initial.weeklyPlan, todos: initial.todos, affectedAcademicEventIds: ["deleted-event"] });
    expect(result.changed).toBe(true);
    expect(result.todos).toEqual([]);
    expect(result.assistantMessage.text).toContain("삭제된 학업 일정");
  });

  it("keeps class review tasks for a one-minute end-time correction", () => {
    const before = academicEventFixture({ id: "class", itemType: "class-schedule", title: "스튜디오 수업", courseName: "스튜디오", date: null, confirmationStatus: "confirmed", classMeetingTimes: [{ id: "meeting", weekday: 4, startTime: "12:00", endTime: "13:40", location: "401" }] });
    const after = { ...before, classMeetingTimes: [{ ...before.classMeetingTimes[0], endTime: "13:39" }] };
    const command = { operationId: "class-generate", requestedAt: "2026-07-20T09:00:00+09:00", requestText: "주간계획 생성", user: demoUser, documents: [], extractedItems: [before], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} } };
    const initial = generateMockWeeklyPlan(command);
    const result = updateMockPlan({ command: { ...command, operationId: "class-update", extractedItems: [after] }, weeklyPlan: initial.weeklyPlan, todos: initial.todos, affectedAcademicEventIds: ["class"], previousAcademicEvents: [before] });
    expect(result.changed).toBe(false);
    expect(result.todos).toEqual(initial.todos);
    expect(result.planDiff?.removedTaskIds).toEqual([]);
  });
});
