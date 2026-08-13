import { describe, expect, it } from "vitest";
import { adjustMockPlan } from "./adjustPlan";
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

describe("adjustMockPlan", () => {
  it("moves the longest Wednesday task to Thursday", () => {
    const result = adjustMockPlan({
      operationId: "adjust-1",
      requestText: "수요일 할 일을 줄여줘",
      requestedAt: "2026-07-20T21:00:00+09:00",
      todos,
    });

    expect(result.changed).toBe(true);
    expect(result.todos.find((todo) => todo.id === "todo-wed")?.scheduledDate).toBe("2026-07-23");
  });

  it("does not report a successful change when no matching task exists", () => {
    const result = adjustMockPlan({
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

    const result = adjustMockPlan(input);

    expect(result.changed).toBe(true);
    expect(result.todos[0].scheduledDate).toBe("2026-08-06");
  });
});
