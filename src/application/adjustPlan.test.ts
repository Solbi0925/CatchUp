import { describe, expect, it } from "vitest";
import { adjustPlanDeterministically } from "./deterministicPlanAdjuster";
import type { Todo } from "../domain/types";

const todos: Todo[] = [
  {
    id: "todo-wed",
    weeklyPlanId: "weekly-1",
    sourceExtractedItemId: "item-1",
    scheduledDate: "2026-07-22",
    title: "긴 보고서 작성하기",
    todoType: "assignment-work",
    courseName: "UX 디자인",
    estimatedDurationMinutes: 90,
    priority: "high",
    isCompleted: false,
    recommendationReason: "마감이 가까워요.",
    durationRationale: [],
    carriedOverFromTodoId: null,
  },
  {
    id: "todo-thu",
    weeklyPlanId: "weekly-1",
    sourceExtractedItemId: "item-1",
    scheduledDate: "2026-07-23",
    title: "보고서 검토하기",
    todoType: "assignment-work",
    courseName: "UX 디자인",
    estimatedDurationMinutes: 30,
    priority: "medium",
    isCompleted: false,
    recommendationReason: "검토 시간이 필요해요.",
    durationRationale: [],
    carriedOverFromTodoId: null,
  },
];

describe("adjustPlanDeterministically", () => {
  it("moves the longest Wednesday task to Thursday", () => {
    const result = adjustPlanDeterministically({
      operationId: "adjust-1",
      requestText: "수요일 할 일을 줄여줘",
      requestedAt: "2026-07-20T21:00:00+09:00",
      todos,
    });

    expect(result.changed).toBe(true);
    expect(result.todos.find((todo) => todo.id === "todo-wed")?.scheduledDate).toBe("2026-07-23");
  });

  it("does not report a successful change when no matching task exists", () => {
    const result = adjustPlanDeterministically({
      operationId: "adjust-2",
      requestText: "일요일 할 일을 가볍게 해줘",
      requestedAt: "2026-07-20T21:00:00+09:00",
      todos,
    });

    expect(result.changed).toBe(false);
  });

  it("derives weekday dates from the current weekly plan instead of a fixed fixture", () => {
    const augustTodos: Todo[] = [
      { ...todos[0], id: "todo-aug-wed", scheduledDate: "2026-08-05" },
    ];
    const input = {
      operationId: "adjust-august",
      requestText: "수요일 할 일을 줄여줘",
      requestedAt: "2026-08-03T09:00:00+09:00",
      weekStartDate: "2026-08-03",
      todos: augustTodos,
    };

    const result = adjustPlanDeterministically(input);

    expect(result.changed).toBe(true);
    expect(result.todos[0].scheduledDate).toBe("2026-08-06");
  });

  it("maps a weekday inside a rolling seven-day plan instead of treating its start as Monday", () => {
    const rollingTodos: Todo[] = [{ ...todos[0], id: "rolling", scheduledDate: "2026-08-13" }];
    const result = adjustPlanDeterministically({
      operationId: "adjust-rolling",
      requestText: "수요일로 옮겨줘",
      requestedAt: "2026-08-13T09:00:00+09:00",
      weeklyPlan: {
        id: "rolling-plan", userId: "user-demo-01", weekStartDate: "2026-08-13", weekEndDate: "2026-08-19",
        status: "complete", createdAt: "2026-08-13T09:00:00+09:00", generationRequest: "생성", referenceWindowEndDate: "2026-09-09", summary: "rolling",
      },
      todos: rollingTodos,
      selectedTodoId: "rolling",
    });
    expect(result.todos[0].scheduledDate).toBe("2026-08-19");
    expect(result.assistantMessage.text).toContain("요청한 날짜 조건");
  });

  it("treats a weekday task-count request as a hard constraint", () => {
    const result = adjustPlanDeterministically({
      operationId: "adjust-count", requestText: "목요일 할 일 1개 이하로 수정해줘", requestedAt: "2026-07-20T09:00:00+09:00",
      weekStartDate: "2026-07-20", todos: [...todos, { ...todos[0], id: "todo-thu-2", scheduledDate: "2026-07-23" }],
    });
    expect(result.changed).toBe(true);
    expect(result.todos.filter((todo) => todo.scheduledDate === "2026-07-23")).toHaveLength(1);
  });
});
