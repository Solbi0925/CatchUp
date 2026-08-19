import { describe, expect, it, vi } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import type { GeneratePlanCommand, Todo, WeeklyPlan } from "../domain/types";
import { normalizeAiPlanInput, runAiPlanning, validateAiPlanDraft, type AiPlanDraft, type WeeklyPlanModelRunner } from "./aiPlanOrchestrator";

const event = academicEventFixture({
  id: "event-exam-1", itemType: "exam", title: "중간고사", date: "2026-08-25",
  examScope: "1~4주차", difficulty: "unknown", estimatedDurationMinutes: 120,
  confirmationStatus: "confirmed", reviewStatus: "confirmed",
});

const command: GeneratePlanCommand = {
  operationId: "ai-plan-1", requestedAt: "2026-08-19T09:00:00+09:00", requestText: "금요일에는 할 일을 1개만 넣어줘.",
  user: { id: "fake-user", displayName: "가짜 학생", calendarConnectionStatus: "connected", weeklyPlanGenerationDay: 3, weeklyPlanGenerationTime: "20:00", planGenerationRequest: "" },
  documents: [], extractedItems: [event], calendarEvents: [], existingWeeklyPlan: null, existingIncompleteTodos: [],
  planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average", preparationByEventId: {}, examGoalByEventId: {}, maxDailyStudyMinutes: 240 },
};

function draft(overrides: Partial<AiPlanDraft> = {}): AiPlanDraft {
  return {
    interpretationSummary: "금요일 할 일을 한 개로 제한합니다.",
    interpretedConstraints: {
      maxDailyMinutes: null, maxTasksByWeekday: [{ weekday: 5, maxTasks: 1 }], prohibitedWeekdays: [], lightStudyWeekdays: [5],
      preferredStudyWeekdaysByEventId: [], blockedTimeRanges: [],
    },
    tasks: [{
      clientTaskKey: "event-exam-1-review-1", sourceAcademicEventId: event.id, title: "시험 범위 1~4주차 복습하기",
      todoType: "exam-study", scheduledDate: "2026-08-20", startTime: "10:00", estimatedDurationMinutes: 120,
      priority: "high", taskPhase: "work", dependsOnClientTaskKey: null, carriedOverFromTodoId: null,
      recommendation: { needReasons: ["시험 준비"], placementReasons: ["개인 일정이 없는 시간"], priorityReasons: ["가까운 시험"], durationReasons: ["저장된 예상시간"], personalizationReasons: [], userRequestReasons: [command.requestText] },
    }],
    warnings: [], questions: [], ...overrides,
  };
}

function existingPlan(): WeeklyPlan {
  return { id: "weekly-existing", userId: command.user.id, weekStartDate: "2026-08-19", weekEndDate: "2026-08-25", referenceWindowEndDate: "2026-09-15", status: "complete", createdAt: command.requestedAt, generationRequest: command.requestText, summary: "기존 계획" };
}

function existingTodo(overrides: Partial<Todo> = {}): Todo {
  return { id: "todo-existing", weeklyPlanId: "weekly-existing", sourceExtractedItemId: event.id, scheduledDate: "2026-08-20", title: "기존 복습", todoType: "exam-study", courseName: event.courseName, estimatedDurationMinutes: 60, priority: "high", isCompleted: false, recommendationReason: "기존", durationRationale: [], carriedOverFromTodoId: null, ...overrides };
}

describe("validateAiPlanDraft", () => {
  it.each([
    ["unknown AcademicEvent", draft({ tasks: [{ ...draft().tasks[0], sourceAcademicEventId: "missing-event" }] }), "UNKNOWN_ACADEMIC_EVENT"],
    ["outside plan", draft({ tasks: [{ ...draft().tasks[0], scheduledDate: "2026-08-30" }] }), "TASK_OUTSIDE_PLAN"],
    ["impossible calendar date", draft({ tasks: [{ ...draft().tasks[0], scheduledDate: "2026-99-99" }] }), "INVALID_DATE"],
    ["after deadline", draft({ tasks: [{ ...draft().tasks[0], scheduledDate: "2026-08-26" }] }), "TASK_AFTER_DEADLINE"],
    ["invalid time", draft({ tasks: [{ ...draft().tasks[0], startTime: "25:00" }] }), "INVALID_TIME"],
    ["zero duration", draft({ tasks: [{ ...draft().tasks[0], estimatedDurationMinutes: 0 }] }), "INVALID_DURATION"],
    ["duplicate task", draft({ tasks: [draft().tasks[0], { ...draft().tasks[0] }] }), "DUPLICATE_TASK"],
    ["schema extra field", { ...draft(), unexpected: true }, "SCHEMA_MISMATCH"],
    ["unsupported enum", draft({ tasks: [{ ...draft().tasks[0], priority: "urgent" as never }] }), "SCHEMA_MISMATCH"],
    ["duplicate interpreted weekday", draft({ interpretedConstraints: { ...draft().interpretedConstraints, prohibitedWeekdays: [4, 4] } }), "SCHEMA_MISMATCH"],
    ["missing required current-week work", draft({ tasks: [] }), "REQUIRED_EVENT_TASK_MISSING"],
    ["artificially shortened work", draft({ tasks: [{ ...draft().tasks[0], estimatedDurationMinutes: 60 }] }), "INSUFFICIENT_EVENT_WORK"],
  ])("rejects %s", (_name, candidate, code) => {
    const result = validateAiPlanDraft(candidate as AiPlanDraft, { mode: "generate", command, plan: existingPlan(), currentTodos: [] });
    expect(result.violations.some((violation) => violation.code === code)).toBe(true);
  });

  it("rejects personal and class time collisions", () => {
    const calendarCommand = { ...command, calendarEvents: [{ id: "meeting", userId: command.user.id, title: "약속", date: "2026-08-20", startTime: "10:30", endTime: "12:00", isAllDay: false, eventType: "personal" as const, source: "catchup" as const, updatedAt: command.requestedAt }], extractedItems: [event, academicEventFixture({ id: "class", itemType: "class-schedule", title: "수업", confirmationStatus: "confirmed", classMeetingTimes: [{ id: "class-time", weekday: 4, startTime: "09:30", endTime: "11:00", location: null }] })] };
    const personal = validateAiPlanDraft(draft(), { mode: "generate", command: calendarCommand, plan: existingPlan(), currentTodos: [] });
    expect(personal.violations.some((violation) => violation.code === "SCHEDULE_TIME_COLLISION")).toBe(true);
    const classDraft = draft({ tasks: [{ ...draft().tasks[0], scheduledDate: "2026-08-20", startTime: "10:00" }] });
    expect(validateAiPlanDraft(classDraft, { mode: "generate", command: { ...calendarCommand, calendarEvents: [] }, plan: existingPlan(), currentTodos: [] }).violations.some((violation) => violation.code === "SCHEDULE_TIME_COLLISION")).toBe(true);
  });

  it("rejects reversed or same-day task dependencies", () => {
    const first = { ...draft().tasks[0], clientTaskKey: "research", title: "요구사항과 자료 정리", scheduledDate: "2026-08-22", taskPhase: "research" as const };
    const second = { ...draft().tasks[0], clientTaskKey: "finalize", title: "검토하고 마무리", scheduledDate: "2026-08-21", taskPhase: "finalize" as const, dependsOnClientTaskKey: "research" };
    const result = validateAiPlanDraft(draft({ tasks: [first, second] }), { mode: "generate", command, plan: existingPlan(), currentTodos: [] });
    expect(result.violations.some((violation) => violation.code === "INVALID_DEPENDENCY")).toBe(true);
    expect(validateAiPlanDraft(draft({ tasks: [first, { ...second, scheduledDate: first.scheduledDate }] }), { mode: "generate", command, plan: existingPlan(), currentTodos: [] }).violations.some((violation) => violation.code === "INVALID_DEPENDENCY")).toBe(true);
  });

  it("preserves completed and unrelated locked todos during updates", () => {
    const completed = existingTodo({ id: "completed", isCompleted: true });
    const unrelated = existingTodo({ id: "unrelated", sourceExtractedItemId: "other-event" });
    const result = validateAiPlanDraft(draft(), { mode: "update", command, plan: existingPlan(), currentTodos: [completed, unrelated], affectedAcademicEventIds: [event.id] });
    expect(result.lockedTodos).toEqual([completed, unrelated]);
  });

  it("enforces prohibited weekdays, daily minutes, and weekday task limits", () => {
    const prohibited = draft({ interpretedConstraints: { ...draft().interpretedConstraints, prohibitedWeekdays: [4] } });
    expect(validateAiPlanDraft(prohibited, { mode: "generate", command, plan: existingPlan(), currentTodos: [] }).violations.some((item) => item.code === "PROHIBITED_WEEKDAY")).toBe(true);
    const shortCapacity = { ...command, planningProfile: { ...command.planningProfile, maxDailyStudyMinutes: 60 } };
    expect(validateAiPlanDraft(draft(), { mode: "generate", command: shortCapacity, plan: existingPlan(), currentTodos: [] }).violations.some((item) => item.code === "DAILY_MINUTES_EXCEEDED")).toBe(true);
    const task = { ...draft().tasks[0], scheduledDate: "2026-08-21" };
    const limited = draft({ tasks: [task, { ...task, clientTaskKey: "second", title: "두 번째 복습" }] });
    expect(validateAiPlanDraft(limited, { mode: "generate", command, plan: existingPlan(), currentTodos: [] }).violations.some((item) => item.code === "WEEKDAY_TASK_LIMIT_EXCEEDED")).toBe(true);
  });
});

describe("normalizeAiPlanInput", () => {
  it("separates the 28-day horizon from valid incomplete carry-over candidates", () => {
    const past = academicEventFixture({ id: "past", title: "지난 과제", date: "2026-08-18", confirmationStatus: "confirmed" });
    const outside = academicEventFixture({ id: "outside", title: "범위 밖 과제", date: "2026-09-16", confirmationStatus: "confirmed" });
    const unconfirmed = academicEventFixture({ id: "unconfirmed", title: "미확정 과제", date: "2026-08-22", confirmationStatus: "unconfirmed" });
    const carry = existingTodo({ id: "carry", sourceExtractedItemId: event.id });
    const candidateCommand = { ...command, extractedItems: [event, past, outside, unconfirmed], existingIncompleteTodos: [carry] };
    const normalized = normalizeAiPlanInput({ mode: "generate", command: candidateCommand, plan: existingPlan(), currentTodos: [] });
    expect(normalized.academicEvents.map((item) => item.id)).toEqual([event.id]);
    expect(normalized.incompleteTodos).toEqual([carry]);
    expect(JSON.stringify(normalized)).not.toContain("sourceReferences");
  });
});

describe("runAiPlanning", () => {
  it("shows a polite, user-friendly generation summary instead of the model's internal wording", async () => {
    const internalSummary = "미완료 Todo가 없어 이월 작업은 없다. Task 간 의존성을 설정하지 않았다.";
    const runner: WeeklyPlanModelRunner = { execute: vi.fn().mockResolvedValue(draft({ interpretationSummary: internalSummary })) };
    const result = await runAiPlanning({ mode: "generate", command, runner });

    expect(result.assistantMessage.text).toContain("8월 19일부터 8월 25일까지의 주간계획을 만들었어요.");
    expect(result.assistantMessage.text).toContain("관련 할 일 1개를 배치했어요.");
    expect(result.assistantMessage.text).not.toMatch(/Todo|Task|의존성|절대 규칙|이월 작업은 없다/);
    expect(result.weeklyPlan.summary).toBe(result.assistantMessage.text);
    expect(result.weeklyPlan.interpretationSummary).toBe(internalSummary);
  });

  it("retries once with structured violations and stores only the valid second draft", async () => {
    const execute = vi.fn().mockResolvedValueOnce(draft({ tasks: [{ ...draft().tasks[0], scheduledDate: "2026-08-30" }] })).mockResolvedValueOnce(draft());
    const runner: WeeklyPlanModelRunner = { execute };
    const result = await runAiPlanning({ mode: "generate", command, runner });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0].validationViolations[0].code).toBe("TASK_OUTSIDE_PLAN");
    expect(result.validationError).toBeUndefined();
    expect(result.todos).toHaveLength(1);
  });

  it("keeps the existing plan when regeneration also violates absolute rules", async () => {
    const previous = existingTodo();
    const runner: WeeklyPlanModelRunner = { execute: vi.fn().mockResolvedValue(draft({ tasks: [{ ...draft().tasks[0], sourceAcademicEventId: "invented" }] })) };
    const result = await runAiPlanning({ mode: "adjust", command: { ...command, existingWeeklyPlan: existingPlan() }, runner, currentPlan: existingPlan(), currentTodos: [previous] });
    expect(result.validationError).toContain("존재하지 않거나");
    expect(result.todos).toEqual([previous]);
    expect(runner.execute).toHaveBeenCalledTimes(2);
  });

  it("materializes an update while preserving completed and unrelated todos byte-for-byte", async () => {
    const completed = existingTodo({ id: "completed", isCompleted: true, title: "완료 작업" });
    const unrelatedEvent = academicEventFixture({ id: "other-event", title: "다른 시험", itemType: "exam", date: "2026-08-25", examScope: "5주차", confirmationStatus: "confirmed" });
    const unrelated = existingTodo({ id: "unrelated", sourceExtractedItemId: unrelatedEvent.id, title: "관련 없는 작업" });
    const affected = existingTodo({ id: "affected", estimatedDurationMinutes: 120 });
    const runner: WeeklyPlanModelRunner = { execute: vi.fn().mockResolvedValue(draft({ tasks: [{ ...draft().tasks[0], scheduledDate: "2026-08-21" }] })) };
    const updateCommand = { ...command, extractedItems: [event, unrelatedEvent], existingWeeklyPlan: existingPlan() };
    const result = await runAiPlanning({ mode: "update", command: updateCommand, runner, currentPlan: existingPlan(), currentTodos: [completed, unrelated, affected], affectedAcademicEventIds: [event.id] });
    expect(result.validationError).toBeUndefined();
    expect(result.todos.find((todo) => todo.id === completed.id)).toEqual(completed);
    expect(result.todos.find((todo) => todo.id === unrelated.id)).toEqual(unrelated);
    expect(result.todos.find((todo) => todo.sourceExtractedItemId === event.id && !todo.isCompleted)?.scheduledDate).toBe("2026-08-21");
  });

  it("does not expose model requests for missing academic facts", async () => {
    const execute = vi.fn().mockResolvedValue(draft({ tasks: [], questions: ["AcademicEvent의 날짜와 마감을 추가해 줄 수 있나요?"] }));
    const runner: WeeklyPlanModelRunner = { execute };
    const result = await runAiPlanning({ mode: "generate", command, runner });
    expect(result.changed).toBe(false);
    expect(result.todos).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.assistantMessage.text).not.toContain("AcademicEvent");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not call the model when no confirmed academic information can be planned", async () => {
    const execute = vi.fn();
    const runner: WeeklyPlanModelRunner = { execute };
    const unconfirmedCommand = { ...command, extractedItems: [academicEventFixture({
      id: "week-only", date: null, scheduledWeek: 8, confirmationStatus: "unconfirmed",
    })] };
    const result = await runAiPlanning({ mode: "generate", command: unconfirmedCommand, runner });
    expect(execute).not.toHaveBeenCalled();
    expect(result.validationError).toBeTruthy();
    expect(result.assistantMessage.text).toContain("시간표를 업로드하면 수업 일정을 바탕으로 이번 주 복습 계획부터 만들 수 있어요");
    expect(result.assistantMessage.actions).toEqual([{ label: "시간표 업로드하기", href: "/upload" }]);
    expect(result.assistantMessage.text).not.toContain("AcademicEvent");
  });
});
