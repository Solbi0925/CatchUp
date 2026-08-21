import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("places the Google Calendar connection card after the briefing, todos, and schedules", () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({ id: "schedule", title: "오늘 제출", date: "2026-07-20", reviewStatus: "confirmed" }),
    ]));
    render(<App initialEntries={["/today"]} />);

    const connectionCard = screen.getByRole("heading", { name: "Google Calendar를 연결해보세요" }).closest("article");
    const briefing = screen.getByRole("heading", { name: "아직 생성된 주간 계획이 없어요." }).closest("article");
    const todos = screen.getByRole("heading", { name: "오늘의 할 일" }).closest("section");
    const schedules = screen.getByRole("heading", { name: "오늘의 예정 일정" }).closest("section");
    expect(connectionCard).not.toBeNull();
    for (const precedingSection of [briefing, todos, schedules]) {
      expect(precedingSection).not.toBeNull();
      expect(precedingSection!.compareDocumentPosition(connectionCard!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows stored plan todos separately from source academic schedules", () => {
    const item = academicEventFixture({ id: "report", title: "보고서 제출", date: "2026-07-20", reviewStatus: "confirmed" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([item]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "주간계획 생성", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "todo", weeklyPlanId: "plan", sourceExtractedItemId: "report", scheduledDate: "2026-07-20", title: "보고서 목차 작성하기", todoType: "assignment-work", courseName: "UX 디자인", estimatedDurationMinutes: 60, priority: "high", isCompleted: false, recommendationReason: "마감을 고려함", durationRationale: ["보고서 분량"], carriedOverFromTodoId: null }],
      todoIdsByWeeklyPlanId: { plan: ["todo"] }, profile: { confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {} },
    }));
    const { container } = render(<App initialEntries={["/today"]} />);
    expect(screen.getByText("보고서 목차 작성하기")).toBeInTheDocument();
    expect(screen.getByText("보고서 제출")).toBeInTheDocument();
    expect(container.querySelectorAll(".today-todo-meta svg")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("encourages the user in the planned Today briefing", () => {
    const item = academicEventFixture({ id: "report", title: "보고서 제출", date: "2026-07-20", reviewStatus: "confirmed" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([item]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "주간계획 생성", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "todo", weeklyPlanId: "plan", sourceExtractedItemId: "report", scheduledDate: "2026-07-20", title: "보고서 목차 작성하기", todoType: "assignment-work", courseName: "UX 디자인", estimatedDurationMinutes: 60, priority: "high", isCompleted: false, recommendationReason: "마감을 고려함", durationRationale: ["보고서 분량"], carriedOverFromTodoId: null }],
      todoIdsByWeeklyPlanId: { plan: ["todo"] }, profile: { confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {} },
    }));

    render(<App initialEntries={["/today"]} />);

    const briefingText = screen.getByText((_, element) =>
      element?.tagName === "P"
      && element.textContent === "우리 오늘도 같이 하나씩 따라잡아봐요~하나씩 끝내다 보면 분명 가벼워질 거예요!");
    expect(briefingText.querySelector("br")).toBeInTheDocument();
  });

  it("shows that a timetable review task has no academic deadline", () => {
    const classItem = academicEventFixture({
      id: "class-item",
      itemType: "class-schedule",
      title: "한국건축사 수업",
      courseName: "한국건축사",
      date: null,
      classMeetingTimes: [{ id: "meeting", weekday: 1, startTime: "09:00", endTime: "10:00", location: null }],
    });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([classItem]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "주간계획 생성", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "class-review", weeklyPlanId: "plan", sourceExtractedItemId: "class-item", scheduledDate: "2026-07-20", title: "한국건축사 수업 내용 복습하기", todoType: "class-prep", courseName: "한국건축사", estimatedDurationMinutes: 45, priority: "medium", isCompleted: false, recommendationReason: "수업 복습", durationRationale: ["시간표 기반"], carriedOverFromTodoId: null }],
      todoIdsByWeeklyPlanId: { plan: ["class-review"] }, profile: { confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {} },
    }));

    render(<App initialEntries={["/today"]} />);

    expect(screen.getByText("마감일 없음")).toBeInTheDocument();
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

  it("shows an exact-date unconfirmed event on the exact day with a provisional label", () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "dated-draft", title: "요구사항 미정 과제", date: "2026-07-20",
      requirements: null, workload: null, submissionMethod: null,
      confirmationStatus: "unconfirmed", confirmationIssues: ["missing-details"], reviewStatus: "needs-review",
    })]));
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByText("요구사항 미정 과제")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요구사항 미정 과제 일정 수정" })).toHaveTextContent("미확정 학업 일정");
  });

  it("labels an exact-date AcademicEvent without a time as 시간 없음", () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "time-unknown", title: "시간 미정 시험", itemType: "exam", date: "2026-07-20", time: null,
      examScope: "1~4주차", confirmationStatus: "confirmed", reviewStatus: "confirmed",
    })]));
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByRole("button", { name: "시간 미정 시험 일정 수정" })).toHaveTextContent("시간 없음");
  });

  it("shows a synchronized Google all-day event separately from time-unknown academic events", () => {
    localStorage.setItem("catchup.calendar-events.v1", JSON.stringify([{
      id: "google-all-day", userId: "user-demo-01", title: "Google 종일 일정", date: "2026-07-20",
      startTime: null, endTime: null, isAllDay: true, eventType: "personal", source: "google-calendar",
      externalId: "external", externalCalendarId: "primary", updatedAt: "2026-07-20T00:00:00Z",
    }]));
    render(<App initialEntries={["/today"]} />);
    const googleAllDayEvent = screen.getByRole("button", { name: "Google 종일 일정 일정 보기" });
    expect(googleAllDayEvent).toHaveTextContent("종일");
    expect(googleAllDayEvent).toHaveTextContent("Google Calendar");
  });

  it("reuses the detailed AcademicEvent editor and persists its fields from Today", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({ id: "today-edit", title: "요구사항 미정 과제", date: "2026-07-20", requirements: null, workload: null, submissionMethod: null, confirmationStatus: "unconfirmed", confirmationIssues: ["missing-details"], reviewStatus: "needs-review" })]));
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "요구사항 미정 과제 일정 수정" }));
    expect(screen.getByRole("dialog", { name: /학업 이벤트 수정/ })).toBeInTheDocument();
    const eventTypeOptions = Array.from(screen.getByRole("combobox", { name: "이벤트 유형" }).querySelectorAll("option"), (option) => option.textContent);
    expect(eventTypeOptions).toEqual(["과제", "시험", "팀 프로젝트", "발표", "퀴즈", "수업 일정", "기타"]);
    fireEvent.change(screen.getByRole("textbox", { name: "요구사항" }), { target: { value: "사례 분석을 포함해 제출" } });
    fireEvent.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.academic-events.v2") ?? "[]")[0].requirements).toBe("사례 분석을 포함해 제출"));
  });
});
