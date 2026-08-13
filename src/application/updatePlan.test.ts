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
});
