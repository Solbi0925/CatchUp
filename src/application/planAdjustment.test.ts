import { describe, expect, it, vi } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import type { GeneratePlanCommand, Todo, WeeklyPlan } from "../domain/types";
import { runPlanAdjustment, type AdjustmentCommandDraft, type AdjustmentCommandRunner } from "./planAdjustment";
import { parsePlanConstraints } from "./planConstraints";

const plan: WeeklyPlan = { id: "plan", userId: "fake-user", weekStartDate: "2026-08-19", weekEndDate: "2026-08-25", referenceWindowEndDate: "2026-09-15", status: "complete", createdAt: "2026-08-19T09:00:00+09:00", generationRequest: "하루 4시간 이하", summary: "가짜 계획" };
const event = academicEventFixture({ id: "event-design", title: "콘텐츠디자인 주제 리서치 과제", itemType: "assignment", date: "2026-08-31", requirements: "주제 리서치", workload: "보고서", confirmationStatus: "confirmed", reviewStatus: "confirmed" });
const otherEvent = academicEventFixture({ id: "event-other", title: "다른 과제", itemType: "assignment", date: "2026-08-30", requirements: "요약", workload: "1쪽", confirmationStatus: "confirmed", reviewStatus: "confirmed" });
const todo = (overrides: Partial<Todo>): Todo => ({ id: "research", weeklyPlanId: plan.id, sourceExtractedItemId: event.id, scheduledDate: "2026-08-24", title: "콘텐츠디자인 주제 리서치 과제 요구사항과 자료 정리하기", todoType: "assignment-work", courseName: "콘텐츠디자인", estimatedDurationMinutes: 90, priority: "medium", isCompleted: false, recommendationReason: "가짜 근거", durationRationale: [], carriedOverFromTodoId: null, taskPhase: "research", dependsOnTodoId: null, ...overrides });
const todos: Todo[] = [
  todo({}),
  todo({ id: "finalize", scheduledDate: "2026-08-20", title: "콘텐츠디자인 주제 리서치 과제 검토하고 마무리하기", estimatedDurationMinutes: 30, taskPhase: "finalize", dependsOnTodoId: "research" }),
  todo({ id: "completed", scheduledDate: "2026-08-19", title: "완료한 준비", isCompleted: true, taskPhase: "prepare" }),
  todo({ id: "unrelated", sourceExtractedItemId: otherEvent.id, scheduledDate: "2026-08-22", title: "다른 과제 진행", estimatedDurationMinutes: 60 }),
];
const command = (requestText: string): GeneratePlanCommand => ({ operationId: "adjust-fast", requestedAt: "2026-08-19T10:00:00+09:00", requestText, user: { id: "fake-user", displayName: "가짜 학생", calendarConnectionStatus: "connected", weeklyPlanGenerationDay: 3, weeklyPlanGenerationTime: "20:00", planGenerationRequest: "" }, documents: [], extractedItems: [event, otherEvent], calendarEvents: [], existingWeeklyPlan: plan, existingIncompleteTodos: [], planningProfile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average", preparationByEventId: {}, examGoalByEventId: {}, maxDailyStudyMinutes: 240 } });
const emptyRunner = (): AdjustmentCommandRunner => ({ execute: vi.fn().mockRejectedValue(new Error("Fast Path에서 호출되면 안 됨")) });
const draft = (overrides: Partial<AdjustmentCommandDraft> = {}): AdjustmentCommandDraft => ({ interpretationSummary: "요청을 해석했습니다.", operations: [], constraints: { maxDailyMinutes: null, maxTasksByWeekday: [], prohibitedWeekdays: [], preferredWeekdays: [] }, warnings: [], questions: [], ...overrides });

describe("runPlanAdjustment", () => {
  it("rebalances the quoted todo flow before its deadline without calling the model", async () => {
    const runner = emptyRunner();
    const result = await runPlanAdjustment({ command: command(`'${todos[0].title}' 계획을 다음의 요청사항을 반영해서 조정해줘: 해당 학업이벤트 마감일에 맞춰서 계획 조정해줘`), plan, todos, selectedTodoId: null, runner });
    expect(runner.execute).not.toHaveBeenCalled();
    expect(result.usedFastPath).toBe(true);
    expect(result.todos.find((item) => item.id === "research")!.scheduledDate < result.todos.find((item) => item.id === "finalize")!.scheduledDate).toBe(true);
    expect(result.todos.find((item) => item.id === "completed")).toEqual(todos[2]);
    expect(result.todos.find((item) => item.id === "unrelated")).toEqual(todos[3]);
  });

  it("repairs a task scheduled after its deadline even when an unrelated baseline constraint violation already exists", async () => {
    const deadlineEvent = { ...event, date: "2026-08-23" };
    const constrainedPlan = { ...plan, generationRequest: "목요일 할 일 1개 이하" };
    const overdue = todo({ scheduledDate: "2026-08-24" });
    const preexistingThursdayTodos = [
      todo({ id: "thursday-1", sourceExtractedItemId: otherEvent.id, title: "기존 목요일 작업 1", scheduledDate: "2026-08-20", estimatedDurationMinutes: 30 }),
      todo({ id: "thursday-2", sourceExtractedItemId: otherEvent.id, title: "기존 목요일 작업 2", scheduledDate: "2026-08-20", estimatedDurationMinutes: 30 }),
    ];
    const relatedFinalize = todo({ id: "deadline-finalize", scheduledDate: "2026-08-20", title: "콘텐츠디자인 주제 리서치 과제 검토하고 마무리하기", estimatedDurationMinutes: 15, taskPhase: "finalize", dependsOnTodoId: overdue.id });
    const before = [overdue, relatedFinalize, ...preexistingThursdayTodos];
    const result = await runPlanAdjustment({
      command: { ...command(`'${overdue.title}' 해당 학업이벤트 마감일에 맞춰서 계획 조정해줘`), extractedItems: [deadlineEvent, otherEvent], existingWeeklyPlan: constrainedPlan },
      plan: constrainedPlan,
      todos: before,
      selectedTodoId: overdue.id,
      runner: emptyRunner(),
    });

    expect(result.changed).toBe(true);
    expect(result.todos.find((item) => item.id === overdue.id)!.scheduledDate < deadlineEvent.date!).toBe(true);
    expect(result.todos.find((item) => item.id === relatedFinalize.id)!.scheduledDate < deadlineEvent.date!).toBe(true);
    expect(result.todos.find((item) => item.id === overdue.id)!.scheduledDate < result.todos.find((item) => item.id === relatedFinalize.id)!.scheduledDate).toBe(true);
    expect(result.todos.filter((item) => item.id.startsWith("thursday-"))).toEqual(preexistingThursdayTodos);
  });

  it("infers an obvious same-event phase order for older todos without dependency metadata", async () => {
    const research = todo({ id: "legacy-research", scheduledDate: "2026-08-24", taskPhase: undefined, dependsOnTodoId: null });
    const finalize = todo({ id: "legacy-finalize", scheduledDate: "2026-08-19", title: "콘텐츠디자인 주제 리서치 과제 검토하고 마무리하기", estimatedDurationMinutes: 15, taskPhase: undefined, dependsOnTodoId: null });
    const runner = emptyRunner();
    const result = await runPlanAdjustment({
      command: command(`'${research.title}' 해당 학업이벤트 마감일에 맞춰서 계획 조정해줘`),
      plan,
      todos: [research, finalize],
      selectedTodoId: research.id,
      runner,
    });

    expect(result.changed).toBe(true);
    expect(runner.execute).not.toHaveBeenCalled();
    const adjustedResearch = result.todos.find((candidate) => candidate.id === research.id)!;
    const adjustedFinalize = result.todos.find((candidate) => candidate.id === finalize.id)!;
    expect(adjustedResearch.scheduledDate < adjustedFinalize.scheduledDate).toBe(true);
    expect(adjustedFinalize.scheduledDate < event.date!).toBe(true);
  });

  it("still rejects a change that leaves a deadline violation on the changed todo", async () => {
    const deadlineEvent = { ...event, date: "2026-08-23" };
    const overdue = todo({ scheduledDate: "2026-08-24", priority: "low" });
    const result = await runPlanAdjustment({
      command: { ...command("이 과제를 먼저 우선 배치해줘"), extractedItems: [deadlineEvent] },
      plan,
      todos: [overdue],
      selectedTodoId: overdue.id,
      runner: emptyRunner(),
    });

    expect(result.changed).toBe(false);
    expect(result.todos).toEqual([overdue]);
    expect(result.validationError).toContain("마감·시험일 이전이 아님");
  });

  it("does not forgive a weekday limit newly introduced by the current request", async () => {
    const deadlineEvent = { ...event, date: "2026-08-23" };
    const overdue = todo({ scheduledDate: "2026-08-24" });
    const preexistingThursdayTodos = [
      todo({ id: "thursday-1", sourceExtractedItemId: otherEvent.id, title: "기존 목요일 작업 1", scheduledDate: "2026-08-20", estimatedDurationMinutes: 30 }),
      todo({ id: "thursday-2", sourceExtractedItemId: otherEvent.id, title: "기존 목요일 작업 2", scheduledDate: "2026-08-20", estimatedDurationMinutes: 30 }),
    ];
    const result = await runPlanAdjustment({
      command: { ...command(`'${overdue.title}' 마감일에 맞춰 조정하고 목요일 할 일 1개 이하로 해줘`), extractedItems: [deadlineEvent, otherEvent] },
      plan,
      todos: [overdue, ...preexistingThursdayTodos],
      selectedTodoId: overdue.id,
      runner: emptyRunner(),
    });

    expect(result.changed).toBe(false);
    expect(result.validationError).toContain("목요일 할 일 2개(최대 1개)");
  });

  it("moves a selected todo to a requested weekday through the Fast Path", async () => {
    const runner = emptyRunner();
    const result = await runPlanAdjustment({ command: command("수요일로 옮겨줘"), plan, todos: [todos[0]], selectedTodoId: "research", runner });
    expect(runner.execute).not.toHaveBeenCalled();
    expect(new Date(`${result.todos[0].scheduledDate}T00:00:00Z`).getUTCDay()).toBe(3);
  });

  it("moves a selected todo to an explicit date through the Fast Path", async () => {
    const result = await runPlanAdjustment({ command: command("8월 21일로 옮겨줘"), plan, todos: [todos[0]], selectedTodoId: "research", runner: emptyRunner() });
    expect(result.todos[0].scheduledDate).toBe("2026-08-21");
  });

  it("수업 준비 할 일을 수업일 이후에 남겨두지 않고 모델 호출 없이 재배치한다", async () => {
    const classEvent = academicEventFixture({
      id: "capstone-class",
      itemType: "class-schedule",
      title: "부산재생캡스톤디자인 수업",
      courseName: "부산재생캡스톤디자인",
      date: null,
      confirmationStatus: "confirmed",
      classMeetingTimes: [{ id: "thursday-class", weekday: 4, startTime: "12:00", endTime: "13:40", location: "401-1001" }],
    });
    const classPreparation = todo({
      id: "class-prep",
      sourceExtractedItemId: classEvent.id,
      title: "부산재생캡스톤디자인 수업 준비",
      courseName: classEvent.courseName,
      todoType: "class-prep",
      scheduledDate: "2026-08-22",
      estimatedDurationMinutes: 60,
      taskPhase: "prepare",
    });
    const runner = emptyRunner();
    const result = await runPlanAdjustment({
      command: { ...command("'부산재생캡스톤디자인 수업 준비' 계획을 다음의 요청사항을 반영해서 조정해줘: 수업일 반영해서 조정해줘"), extractedItems: [classEvent] },
      plan,
      todos: [classPreparation],
      selectedTodoId: classPreparation.id,
      runner,
    });

    expect(runner.execute).not.toHaveBeenCalled();
    expect(result.changed).toBe(true);
    expect(result.todos[0].scheduledDate <= "2026-08-20").toBe(true);
  });

  it("reduces today's load without moving work beyond the deadline", async () => {
    const todayTodos = [todo({ scheduledDate: "2026-08-19" }), todo({ id: "second", title: "두 번째 작업", scheduledDate: "2026-08-19", estimatedDurationMinutes: 30 })];
    const result = await runPlanAdjustment({ command: command("오늘 할 일을 줄여줘"), plan, todos: todayTodos, selectedTodoId: null, runner: emptyRunner() });
    expect(result.todos.filter((item) => item.scheduledDate === "2026-08-19")).toHaveLength(1);
    expect(result.todos.every((item) => item.scheduledDate < event.date!)).toBe(true);
  });

  it("keeps an explicit weekday hour limit instead of replacing it with the light-day default", () => {
    const constraints = parsePlanConstraints("월요일에 할 일 2시간 이하로 줄여줘");

    expect(constraints.maxMinutesByWeekday[1]).toBe(120);
  });

  it("moves enough Monday tasks to satisfy an explicit two-hour limit", async () => {
    const mondayTodos = [
      todo({ id: "monday-90", scheduledDate: "2026-08-24", estimatedDurationMinutes: 90 }),
      todo({ id: "monday-45-a", scheduledDate: "2026-08-24", estimatedDurationMinutes: 45, title: "월요일 작업 A" }),
      todo({ id: "monday-45-b", scheduledDate: "2026-08-24", estimatedDurationMinutes: 45, title: "월요일 작업 B" }),
      todo({ id: "monday-45-c", scheduledDate: "2026-08-24", estimatedDurationMinutes: 45, title: "월요일 작업 C" }),
    ];
    const result = await runPlanAdjustment({
      command: command("월요일에 할 일 2시간 이하로 줄여줘"),
      plan,
      todos: mondayTodos,
      selectedTodoId: null,
      runner: emptyRunner(),
    });

    expect(result.changed).toBe(true);
    expect(result.usedFastPath).toBe(true);
    expect(result.todos.filter((item) => item.scheduledDate === "2026-08-24").reduce((sum, item) => sum + item.estimatedDurationMinutes, 0)).toBe(90);
  });

  it("preserves total duration when splitting a task", async () => {
    const original = todo({ scheduledDate: "2026-08-20", estimatedDurationMinutes: 180 });
    const result = await runPlanAdjustment({ command: command("이 할 일을 두 날로 나눠줘"), plan, todos: [original], selectedTodoId: original.id, runner: emptyRunner() });
    expect(result.todos.reduce((sum, item) => sum + item.estimatedDurationMinutes, 0)).toBe(180);
    expect(result.todos).toHaveLength(2);
  });

  it("splits onto another valid day when the next day has reached its task limit", async () => {
    const constrainedPlan = { ...plan, generationRequest: "목요일 할 일 1개 이하" };
    const deadlineEvent = { ...event, date: "2026-08-23" };
    const original = todo({ id: "split-target", scheduledDate: "2026-08-19", estimatedDurationMinutes: 180 });
    const existingThursday = todo({ id: "thursday-existing", sourceExtractedItemId: otherEvent.id, scheduledDate: "2026-08-20", title: "기존 목요일 작업", estimatedDurationMinutes: 45 });
    const busyFriday = todo({ id: "friday-existing", sourceExtractedItemId: otherEvent.id, scheduledDate: "2026-08-21", title: "기존 금요일 작업", estimatedDurationMinutes: 120 });
    const finalize = todo({ id: "split-finalize", scheduledDate: "2026-08-22", title: "콘텐츠디자인 주제 리서치 과제 검토하고 마무리하기", estimatedDurationMinutes: 15, taskPhase: undefined, dependsOnTodoId: null });
    const result = await runPlanAdjustment({
      command: { ...command(`'${original.title}' 이 할 일 하루만에 다 못할 거 같아. 두번에 나눠서 할래`), existingWeeklyPlan: constrainedPlan, extractedItems: [deadlineEvent, otherEvent] },
      plan: constrainedPlan,
      todos: [original, existingThursday, busyFriday, finalize],
      selectedTodoId: original.id,
      runner: emptyRunner(),
    });

    expect(result.changed).toBe(true);
    expect(result.usedFastPath).toBe(true);
    expect(result.todos.find((item) => item.id === existingThursday.id)).toEqual(existingThursday);
    expect(result.todos.find((item) => item.id === busyFriday.id)).toEqual(busyFriday);
    const splitParts = result.todos.filter((item) => item.id === original.id || item.id.startsWith(`${original.id}-split-`));
    expect(splitParts).toHaveLength(2);
    expect(splitParts.reduce((sum, item) => sum + item.estimatedDurationMinutes, 0)).toBe(180);
    expect(splitParts.some((item) => item.scheduledDate === "2026-08-20")).toBe(false);
    expect(splitParts[1].scheduledDate).toBe("2026-08-21");
    expect(result.todos.find((item) => item.id === finalize.id)?.dependsOnTodoId).toBe(splitParts[1].id);
  });

  it("keeps the plan when deadline capacity makes rebalancing impossible", async () => {
    const urgent = { ...event, date: "2026-08-20" };
    const result = await runPlanAdjustment({ command: { ...command(`'${todos[0].title}' 마감일에 맞춰서 다시 조정해`), extractedItems: [urgent, otherEvent] }, plan, todos, selectedTodoId: null, runner: emptyRunner() });
    expect(result.changed).toBe(false);
    expect(result.todos).toEqual(todos);
    expect(result.resultCode).toBe("conflict");
  });

  it("rejects a move whose retained start time collides with a calendar event", async () => {
    const timed = todo({ scheduledDate: "2026-08-20", startTime: "10:00", estimatedDurationMinutes: 60 });
    const collisionCommand = { ...command("2026-08-21로 옮겨줘"), calendarEvents: [{ id: "calendar", userId: "fake-user", title: "익명 일정", date: "2026-08-21", startTime: "10:30", endTime: "11:30", isAllDay: false, eventType: "personal" as const, source: "catchup" as const, updatedAt: "2026-08-19T09:00:00+09:00" }] };
    const result = await runPlanAdjustment({ command: collisionCommand, plan, todos: [timed], selectedTodoId: timed.id, runner: emptyRunner() });
    expect(result.changed).toBe(false);
    expect(result.todos).toEqual([timed]);
    expect(result.validationError).toContain("충돌");
  });

  it("uses compact command input for ambiguous language and retries unknown IDs only once", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(draft({ operations: [{ type: "prioritize", targetTodoIds: ["missing"], targetAcademicEventIds: [event.id], scheduledDate: null, weekday: null, minutes: null, taskCount: null }] }))
      .mockResolvedValueOnce(draft({ operations: [{ type: "prioritize", targetTodoIds: ["research"], targetAcademicEventIds: [event.id], scheduledDate: null, weekday: null, minutes: null, taskCount: null }] }));
    const result = await runPlanAdjustment({ command: command("이 작업을 좀 더 적절하게 정리해줘"), plan, todos: [todos[0]], selectedTodoId: "research", runner: { execute } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0].input).not.toHaveProperty("documents");
    expect(JSON.stringify(execute.mock.calls[0][0].input)).not.toContain("sourceReferences");
    expect(JSON.stringify(execute.mock.calls[0][0].input).length).toBeLessThan(JSON.stringify(command("이 작업을 좀 더 적절하게 정리해줘")).length);
    expect(result.changed).toBe(true);
    expect(result.todos.find((item) => item.id === "research")?.priority).toBe("high");
  });

  it("never exposes model field names or free-form model wording in AI Mate messages", async () => {
    const runner: AdjustmentCommandRunner = {
      execute: vi.fn().mockResolvedValue(draft({
        interpretationSummary: "candidateTodos 중 대상 Todo를 우선 처리하겠다.",
        operations: [],
        questions: ["대상 Todo를 candidateTodos에 포함해 주시겠어요?"],
      })),
    };

    const result = await runPlanAdjustment({
      command: command("시간표를 반영해서 계획 짜줘"),
      plan,
      todos: [todos[0]],
      selectedTodoId: null,
      runner,
    });

    expect(result.resultCode).toBe("question");
    expect(result.assistantMessage.text).toMatch(/^조정 전에 한 가지만 확인할게요\./);
    expect(result.assistantMessage.text).not.toMatch(/candidateTodos|Todo|Task|AcademicEvent|WeeklyPlan/i);
    expect(result.questions[0]).toBe(result.assistantMessage.text);
  });

  it("keeps a safe model clarification inside the fixed question format", async () => {
    const runner: AdjustmentCommandRunner = {
      execute: vi.fn().mockResolvedValue(draft({
        operations: [],
        questions: ["어느 과목의 할 일을 시간표에 맞춰 조정할까요?"],
      })),
    };

    const result = await runPlanAdjustment({
      command: command("시간표를 반영해서 계획 짜줘"),
      plan,
      todos: [todos[0]],
      selectedTodoId: null,
      runner,
    });

    expect(result.resultCode).toBe("question");
    expect(result.assistantMessage.text).toBe("조정 전에 한 가지만 확인할게요. 어느 과목의 할 일을 시간표에 맞춰 조정할까요?");
  });

  it("does not let the model ask AI Mate for missing academic facts", async () => {
    const runner: AdjustmentCommandRunner = {
      execute: vi.fn().mockResolvedValue(draft({
        operations: [],
        questions: ["선택한 과제의 마감일은 언제인가요?"],
      })),
    };

    const result = await runPlanAdjustment({
      command: command("마감일을 반영해서 조정해줘"),
      plan,
      todos: [todos[0]],
      selectedTodoId: "research",
      runner,
    });

    expect(result.resultCode).toBe("no-change");
    expect(result.questions).toEqual([]);
    expect(result.assistantMessage.text).toMatch(/AI Mate에서 새로 정하지 않아요.*Upload의 학업 이벤트 확인 및 수정 화면/);
    expect(result.assistantMessage.text).not.toContain("마감일은 언제인가요");
  });

  it("keeps technical model failures out of the AI Mate message", async () => {
    const runner: AdjustmentCommandRunner = {
      execute: vi.fn().mockRejectedValue(new Error("JSON_SCHEMA_MISMATCH: candidateTodos를 파싱할 수 없음")),
    };

    const result = await runPlanAdjustment({
      command: command("이 할 일을 조정해줘"),
      plan,
      todos: [todos[0]],
      selectedTodoId: "research",
      runner,
    });

    expect(result.resultCode).toBe("model-failure");
    expect(result.assistantMessage.text).toBe("요청을 처리하는 중 문제가 생겨 주간계획을 변경하지 않았어요. 잠시 후 다시 시도해주세요.");
    expect(result.assistantMessage.text).not.toMatch(/JSON|candidateTodos|schema/i);
    expect(result.validationError).toContain("JSON_SCHEMA_MISMATCH");
  });

  it("wraps flexible model decisions in the fixed adjustment response format", async () => {
    const runner: AdjustmentCommandRunner = {
      execute: vi.fn().mockResolvedValue(draft({
        interpretationSummary: "내가 원하는 방식으로 candidateTodos를 바꾸겠다.",
        operations: [{ type: "prioritize", targetTodoIds: ["research"], targetAcademicEventIds: [event.id], scheduledDate: null, weekday: null, minutes: null, taskCount: null }],
      })),
    };

    const result = await runPlanAdjustment({
      command: command("이 할 일을 더 중요하게 반영해줘"),
      plan,
      todos: [todos[0]],
      selectedTodoId: "research",
      runner,
    });

    expect(result.changed).toBe(true);
    expect(result.assistantMessage.text).toMatch(/^요청을 반영해 주간계획을 조정했어요\./);
    expect(result.assistantMessage.text).not.toMatch(/candidateTodos|Todo|Task|AcademicEvent|WeeklyPlan|내가 원하는 방식/i);
  });

  it("rejects unknown IDs twice and never lets a command overwrite the whole plan", async () => {
    const execute = vi.fn().mockResolvedValue(draft({ operations: [{ type: "move", targetTodoIds: ["invented"], targetAcademicEventIds: [event.id], scheduledDate: "2026-08-21", weekday: null, minutes: null, taskCount: null }] }));
    const result = await runPlanAdjustment({ command: command("알아서 일정 흐름을 더 좋게 바꿔줘"), plan, todos, selectedTodoId: null, runner: { execute } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.todos).toEqual(todos);
    expect(result.changed).toBe(false);
  });
});
