import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";
import { academicEventFixture } from "../../test/academicEventFixture";

afterEach(cleanup);

describe("Today screen", () => {
  it("starts on the real current Monday-Sunday week and can navigate weeks", () => {
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByRole("button", { name: /7월 20일 월요일.*오늘.*선택됨/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 주" }));
    expect(screen.getByRole("button", { name: /7월 27일 월요일.*선택됨/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 주" }));
    expect(screen.getByRole("button", { name: /7월 20일 월요일.*선택됨/ })).toBeInTheDocument();
  });

  it("shows stored plan todos separately from source academic schedules", () => {
    const item = academicEventFixture({ id: "report", title: "보고서 제출", date: "2026-07-20", reviewStatus: "confirmed" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([item]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "주간계획 생성", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "todo", weeklyPlanId: "plan", sourceExtractedItemId: "report", scheduledDate: "2026-07-20", title: "보고서 목차 작성하기", todoType: "assignment-work", courseName: "UX 디자인", estimatedDurationMinutes: 60, priority: "high", isCompleted: false, recommendationReason: "마감을 고려함", durationRationale: ["보고서 분량"], carriedOverFromTodoId: null }],
      todoIdsByWeeklyPlanId: { plan: ["todo"] }, profile: { confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {} },
    }));
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByText("보고서 목차 작성하기")).toBeInTheDocument();
    expect(screen.getByText("보고서 제출")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("shows a mapped week-only exam as provisional on every day of that week", () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "week-exam", title: "8주차 중간고사", itemType: "exam", date: null, scheduledWeek: 8,
      scheduledWeekLabel: "8주차", examScope: null, reviewStatus: "confirmed", confirmationStatus: "unconfirmed", confirmationIssues: ["missing-date", "missing-exam-scope"],
    })]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [], todos: [], todoIdsByWeeklyPlanId: {},
      profile: { semesterWeekOneStartDate: "2026-06-01", confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {} },
    }));
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByText("8주차 중간고사 주")).toBeInTheDocument();
    expect(screen.getByText("미확정 일정")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /7월 26일 일요일/ }));
    expect(screen.getByText("8주차 중간고사 주")).toBeInTheDocument();
  });

  it("does not assign a week-only event when no date mapping exists", () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "week-exam", title: "8주차 중간고사", itemType: "exam", date: null, scheduledWeek: 8,
      scheduledWeekLabel: "8주차", reviewStatus: "confirmed", confirmationStatus: "unconfirmed",
    })]));
    render(<App initialEntries={["/today"]} />);
    expect(screen.queryByText("8주차 중간고사 주")).not.toBeInTheDocument();
  });
});
