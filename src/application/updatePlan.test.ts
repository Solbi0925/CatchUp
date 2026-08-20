import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { generateMockWeeklyPlan } from "./mockPlanEngine";
import { updateMockPlan } from "./updatePlan";
import { parsePlanConstraints, validatePlanConstraints } from "./planConstraints";
import { demoUser } from "../mocks/templates";
import type { Todo, WeeklyPlan } from "../domain/types";

describe("updateMockPlan", () => {
  it("keeps concept-presentation phases ordered and avoids an already saturated August 24", () => {
    const presentation = academicEventFixture({
      id: "concept-presentation",
      title: "건축종합설계스튜디오(IV) 개념설계 발표",
      itemType: "presentation",
      courseName: "건축종합설계스튜디오(IV)",
      date: "2026-09-01",
      requirements: "개념설계 발표자료 준비",
      estimatedDurationMinutes: 180,
      reviewStatus: "confirmed",
    });
    const phantomEvents = Array.from({ length: 5 }, (_, index) => academicEventFixture({
      id: `other-exam-${index}`,
      title: `다른 시험 ${index + 1}`,
      itemType: "exam",
      courseName: `다른 과목 ${index + 1}`,
      date: "2026-08-27",
      examScope: "1~2주차",
      estimatedDurationMinutes: 30,
      reviewStatus: "confirmed",
    }));
    const timetable = academicEventFixture({
      id: "monday-class",
      itemType: "class-schedule",
      title: "월요일 스튜디오 수업",
      courseName: "스튜디오",
      date: null,
      confirmationStatus: "confirmed",
      classMeetingTimes: [{ id: "monday", weekday: 1, startTime: "09:00", endTime: "12:00", location: "스튜디오" }],
    });
    const plan: WeeklyPlan = {
      id: "plan-august",
      userId: demoUser.id,
      weekStartDate: "2026-08-19",
      weekEndDate: "2026-08-25",
      status: "complete",
      createdAt: "2026-08-19T09:00:00+09:00",
      generationRequest: "주간계획 생성",
      referenceWindowEndDate: "2026-09-15",
      summary: "기존 계획",
    };
    const saturatedTodo: Todo = {
      id: "existing-heavy-task",
      weeklyPlanId: plan.id,
      sourceExtractedItemId: phantomEvents[0].id,
      scheduledDate: "2026-08-24",
      title: "기존 집중 작업",
      todoType: "exam-study",
      courseName: phantomEvents[0].courseName,
      estimatedDurationMinutes: 240,
      priority: "high",
      isCompleted: false,
      recommendationReason: "기존 계획",
      durationRationale: [],
      carriedOverFromTodoId: null,
    };
    const command = {
      operationId: "concept-update",
      requestedAt: "2026-08-19T09:00:00+09:00",
      requestText: plan.generationRequest,
      user: demoUser,
      documents: [],
      extractedItems: [...phantomEvents, timetable, presentation],
      calendarEvents: [{
        id: "personal-aug-24", userId: demoUser.id, title: "개인 일정", date: "2026-08-24",
        startTime: "14:00", endTime: "16:00", isAllDay: false, eventType: "personal" as const,
        source: "catchup" as const, updatedAt: "2026-08-19T00:00:00+09:00",
      }],
      existingWeeklyPlan: plan,
      existingIncompleteTodos: [saturatedTodo],
      planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} },
    };

    const result = updateMockPlan({
      command,
      weeklyPlan: plan,
      todos: [saturatedTodo],
      affectedAcademicEventIds: [presentation.id],
    });
    const presentationTasks = result.todos.filter((todo) => todo.sourceExtractedItemId === presentation.id);
    const prepare = presentationTasks.find((todo) => todo.title.includes("요구사항과 자료 정리"));
    const finalize = presentationTasks.find((todo) => todo.title.includes("검토하고 마무리"));

    expect(prepare).toBeDefined();
    expect(finalize).toBeDefined();
    expect(prepare!.scheduledDate < finalize!.scheduledDate).toBe(true);
    expect(prepare!.taskPhase).toBe("research");
    expect(finalize!.taskPhase).toBe("finalize");
    const finalPredecessor = presentationTasks.find((todo) => todo.id === finalize!.dependsOnTodoId);
    expect(finalPredecessor).toBeDefined();
    expect(finalPredecessor!.scheduledDate < finalize!.scheduledDate).toBe(true);
    expect(presentationTasks.every((todo) => todo.scheduledDate !== "2026-08-24")).toBe(true);
    expect(result.todos.find((todo) => todo.id === saturatedTodo.id)).toEqual(saturatedTodo);
    expect(presentationTasks.flatMap((todo) => todo.recommendationDetails?.placementReasons ?? []).join(" ")).toContain("2026-08-24의 총 부담 540분");
    expect(result.assistantMessage.text).toContain("총 부담 540분보다 여유");
    const invalidOrder = result.todos.map((todo) => todo.id === finalize!.id ? { ...todo, scheduledDate: prepare!.scheduledDate } : todo);
    const validation = validatePlanConstraints(invalidOrder, parsePlanConstraints(plan.generationRequest), plan, command.extractedItems, undefined, undefined, command.calendarEvents);
    expect(validation.ok).toBe(false);
    expect(validation.violations.some((violation) => violation.includes("선행 Task"))).toBe(true);
  });

  it("keeps completed work and refreshes only affected event tasks", () => {
    const event = academicEventFixture({ id: "exam", itemType: "exam", date: "2026-07-26", examScope: "1~7주차", estimatedDurationMinutes: 180, reviewStatus: "confirmed" });
    const command = { operationId: "generate", requestedAt: "2026-07-20T09:00:00+09:00", requestText: "주간계획 생성", user: demoUser, documents: [], extractedItems: [event], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} } };
    const initial = generateMockWeeklyPlan(command);
    const completed = { ...initial.todos[0], isCompleted: true };
    const result = updateMockPlan({ command: { ...command, operationId: "update" }, weeklyPlan: initial.weeklyPlan, todos: [completed, ...initial.todos.slice(1)], affectedAcademicEventIds: ["exam"] });
    expect(result.todos.find((todo) => todo.id === completed.id)).toEqual(completed);
    expect(result.todos.filter((todo) => todo.isCompleted)).toHaveLength(1);
    expect(result.todos.filter((todo) => todo.dependsOnTodoId).every((todo) => result.todos.some((candidate) => candidate.id === todo.dependsOnTodoId))).toBe(true);
  });

  it("새 개인 일정과 겹치는 미완료 할 일만 다른 날로 옮긴다", () => {
    const event = academicEventFixture({ id: "report", date: "2026-07-26", estimatedDurationMinutes: 60, reviewStatus: "confirmed" });
    const command = { operationId: "generate-personal", requestedAt: "2026-07-20T09:00:00+09:00", requestText: "주간계획 생성", user: demoUser, documents: [], extractedItems: [event], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average" as const, preparationByEventId: {}, examGoalByEventId: {} } };
    const initial = generateMockWeeklyPlan(command);
    const collisionDate = initial.todos[0].scheduledDate;
    const result = updateMockPlan({ command: { ...command, operationId: "personal-update", calendarEvents: [{ id: "personal", userId: demoUser.id, title: "종일 약속", date: collisionDate, startTime: null, endTime: null, isAllDay: true, eventType: "personal", source: "catchup", updatedAt: command.requestedAt }] }, weeklyPlan: initial.weeklyPlan, todos: initial.todos, affectedAcademicEventIds: [] });
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
