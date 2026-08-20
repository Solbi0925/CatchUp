import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../app/App";
import { academicEventFixture } from "../../test/academicEventFixture";
import { PrototypeStoreProvider } from "../../store/PrototypeStore";
import { AiMateLayer } from "./AiMateLayer";
import { AiMateProvider, GENERATE_PLAN_DRAFT, useAiMate } from "./AiMateProvider";
import { adjustmentUsageDate } from "../../domain/adjustmentUsage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function PromptChipHarness() {
  const { openWithDraft } = useAiMate();
  return <button type="button" onClick={() => openWithDraft("", [{ label: "할 일 추천이유", draft: "추천 이유를 알려줘" }])}>맥락 열기</button>;
}

function seedMaxDailyStudyTime(minutes = 240) {
  localStorage.setItem("catchup.planning.v1", JSON.stringify({
    weeklyPlans: [], todos: [], todoIdsByWeeklyPlanId: {},
    profile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: null, preparationByEventId: {}, examGoalByEventId: {}, maxDailyStudyMinutes: minutes },
  }));
}

describe("AI Mate first plan flow", () => {
  function seedPlan() {
    const event = academicEventFixture({ id: "report", title: "행정기획론 보고서", courseName: "행정기획론", date: "2026-07-26", reviewStatus: "confirmed" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([event]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "금요일은 쉬고 싶어", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "todo", weeklyPlanId: "plan", sourceExtractedItemId: "report", scheduledDate: "2026-07-20", title: "행정기획론 보고서 자료 조사", todoType: "assignment-work", courseName: "행정기획론", estimatedDurationMinutes: 90, priority: "high", isCompleted: false, recommendationReason: "마감 전에 자료를 조사하도록 배치했어요.", durationRationale: ["보고서 분량"], carriedOverFromTodoId: null, recommendationDetails: { relatedAcademicEventId: "report", needReasons: ["7월 26일 보고서 마감에 대비"], placementReasons: ["월요일 학습량이 적음"], priorityReasons: ["마감이 가까움"], durationReasons: ["보고서 분량"], personalizationReasons: [], userRequestReasons: ["금요일은 쉬고 싶어"], carriedOver: false, provisionalExamStudy: false } }],
      todoIdsByWeeklyPlanId: { plan: ["todo"] }, profile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average", preparationByEventId: {}, examGoalByEventId: {} }, adjustmentUsageByDate: {}, planAdjustments: [], pendingPlanUpdate: null,
    }));
  }

  it("only fills the composer when a prompt chip is selected", () => {
    render(<MemoryRouter><PrototypeStoreProvider><AiMateProvider><PromptChipHarness /><AiMateLayer showCoachmark={false} /></AiMateProvider></PrototypeStoreProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "맥락 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "할 일 추천이유" }));
    expect(screen.getByRole("textbox", { name: "AI Mate 메시지" })).toHaveValue("추천 이유를 알려줘");
    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
  });

  it("asks for maximum daily study time once and persists it before creating the first plan", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "hard-report", title: "행정기획론 보고서", courseName: "행정기획론", date: "2026-07-23",
      estimatedDurationMinutes: 180, difficulty: "high", reviewStatus: "confirmed",
    })]));
    render(<App initialEntries={["/upload"]} />);

    expect(screen.getByRole("status")).toHaveTextContent("주간계획 생성해봐요!");
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 생성" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    expect(composer).toHaveValue(GENERATE_PLAN_DRAFT);
    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
    fireEvent.change(composer, { target: { value: `${GENERATE_PLAN_DRAFT}금요일에는 공부하지 않고 싶어.` } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(await screen.findByText(/주간계획을 생성하는 중입니다/)).toBeInTheDocument();
    expect(await screen.findByText(/하루에 최대 몇 시간 정도까지/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "4-6시간" }));
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/주간계획을 만들었어요/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").weeklyPlans).toHaveLength(1));
    expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").profile.maxDailyStudyMinutes).toBe(300);
    expect(localStorage.getItem("catchup.planning.v1")).toContain("금요일에는 공부하지 않고 싶어");
  });

  it("keeps the planning question open when the answer cannot be understood", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "report", title: "행정기획론 보고서", date: "2026-07-23", estimatedDurationMinutes: 120,
      reviewStatus: "confirmed", confirmationStatus: "confirmed",
    })]));
    render(<App initialEntries={["/today"]} />);

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 생성" }));
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/하루에 최대 몇 시간 정도까지/)).toBeInTheDocument();

    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "2028" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(await screen.findByText(/이해하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/답변을 저장했어요/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2-4시간" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").profile?.maxDailyStudyMinutes).toBeFalsy();
  });

  it("최초 생성 문장에 수정형 추가 조건이 붙어도 생성으로 처리한다", async () => {
    seedMaxDailyStudyTime();
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({ id: "a", title: "A 보고서", date: "2026-07-25", estimatedDurationMinutes: 240, difficulty: "low", reviewStatus: "confirmed" }),
      academicEventFixture({ id: "b", title: "B 보고서", date: "2026-07-26", estimatedDurationMinutes: 240, difficulty: "low", reviewStatus: "confirmed" }),
      academicEventFixture({ id: "c", title: "C 보고서", date: "2026-07-26", estimatedDurationMinutes: 240, difficulty: "low", reviewStatus: "confirmed" }),
    ]));
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "주간계획 생성해줘. 다음의 요청사항을 반영해: 목요일, 금요일에는 할 일 1개 이하로 줄여줘." } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/주간계획을 만들었어요/)).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      expect(stored.weeklyPlans).toHaveLength(1);
      expect(stored.todos.filter((todo: { scheduledDate: string }) => todo.scheduledDate === "2026-07-23").length).toBeLessThanOrEqual(1);
      expect(stored.todos.filter((todo: { scheduledDate: string }) => todo.scheduledDate === "2026-07-24").length).toBeLessThanOrEqual(1);
    });
  });

  it("does not ask users to fill missing academic dates during initial plan generation", async () => {
    seedMaxDailyStudyTime();
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "week-exam", title: "행정기획론 중간고사", courseName: "행정기획론",
      itemType: "exam", date: null, scheduledWeek: 8, scheduledWeekLabel: "8주차",
      weekOneStartDate: null, examScope: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed", confirmationIssues: ["missing-date", "missing-exam-scope"],
    })]));
    render(<App initialEntries={["/upload"]} />);

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "주간계획 생성해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/시간표를 업로드하면 수업 일정을 바탕으로 이번 주 복습 계획부터 만들 수 있어요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시간표 업로드하기" })).toHaveAttribute("href", "/upload");
    expect(screen.queryByText(/이번 학기 1주차는 언제 시작하나요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AcademicEvent/)).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").weeklyPlans).toHaveLength(0);
  });

  it("creates a review plan when a confirmed timetable is available", async () => {
    seedMaxDailyStudyTime();
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "timetable", itemType: "class-schedule", title: "도시건축 수업", courseName: "도시건축",
      date: null, confirmationStatus: "confirmed", reviewStatus: "confirmed",
      classMeetingTimes: [{ id: "monday", weekday: 1, startTime: "10:30", endTime: "11:45", location: "401-930" }],
    })]));
    render(<App initialEntries={["/upload"]} />);

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "주간계획 생성해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(await screen.findByText(/시간표를 바탕으로 도시건축 수업 준비와 복습 할 일/)).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      expect(stored.todos.some((todo: { title: string }) => todo.title === "도시건축 수업 내용 복습하기")).toBe(true);
    });
    expect(screen.queryByRole("link", { name: "시간표 업로드하기" })).not.toBeInTheDocument();
  });

  it("skips personalization questions when duration inputs are already sufficient", async () => {
    seedMaxDailyStudyTime();
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "known-work", estimatedDurationMinutes: 60, difficulty: "low", reviewStatus: "confirmed",
    })]));
    render(<App initialEntries={["/upload"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "주간계획 생성해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/주간계획을 만들었어요/)).toBeInTheDocument();
    expect(screen.queryByText(/어느 정도 자신/)).not.toBeInTheDocument();
  });

  it("asks for a weekly plan before adjustment when no plan exists", async () => {
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "금요일 계획을 줄여줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText("먼저 주간계획을 생성해주세요.")).toBeInTheDocument();
  });

  it("opens a Today task context, fills the edit template, and does not charge an empty request", async () => {
    seedPlan(); render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: /행정기획론 보고서 자료 조사 AI Mate에서 보기/ }));
    expect(screen.getByRole("button", { name: "주간계획 수정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "할 일 추천이유" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "주간계획 수정" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    expect(composer).toHaveValue("'행정기획론 보고서 자료 조사' 계획을 다음의 요청사항을 반영해서 조정해줘: ");
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/요청사항이 입력되지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByText("조정 잔여 10회")).toBeInTheDocument();
  });

  it("moves a selected task without changing its AcademicEvent and charges once", async () => {
    seedPlan(); render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: /행정기획론 보고서 자료 조사 AI Mate에서 보기/ }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 수정" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: `${composer.getAttribute("value") ?? "'행정기획론 보고서 자료 조사' 계획을 다음의 요청사항을 반영해서 조정해줘: "}토요일로 옮겨줘.` } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/요청한 날짜 조건을 반영/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("조정 잔여 9회")).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("catchup.academic-events.v2") ?? "[]")[0].date).toBe("2026-07-26");
  });

  it("splits class preparation only into dates before the upcoming class", async () => {
    const courseName = "부산재생캡스톤디자인";
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "capstone-class", itemType: "class-schedule", title: `${courseName} 수업`, courseName,
      date: null, confirmationStatus: "confirmed", reviewStatus: "confirmed",
      classMeetingTimes: [{ id: "thursday-class", weekday: 4, startTime: "12:00", endTime: "13:40", location: "401-1001" }],
    })]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "주간계획 생성", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "class-prep", weeklyPlanId: "plan", sourceExtractedItemId: "capstone-class", scheduledDate: "2026-07-23", title: `${courseName} 수업 준비`, todoType: "class-prep", courseName, estimatedDurationMinutes: 60, priority: "medium", isCompleted: false, recommendationReason: "수업 준비", durationRationale: ["시간표 기반"], carriedOverFromTodoId: null, taskPhase: "prepare", dependsOnTodoId: null }],
      todoIdsByWeeklyPlanId: { plan: ["class-prep"] }, profile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average", preparationByEventId: {}, examGoalByEventId: {}, maxDailyStudyMinutes: 240 }, adjustmentUsageByDate: {}, planAdjustments: [], pendingPlanUpdate: null,
    }));
    render(<App initialEntries={["/today"]} />);

    fireEvent.click(screen.getByRole("button", { name: "7월 23일 목요일" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${courseName} 수업 준비 AI Mate에서 보기`) }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 수정" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: `'${courseName} 수업 준비' 계획을 다음의 요청사항을 반영해서 조정해줘: 2개로 나눠줘` } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    await screen.findByText(/두.*나누어 조정했어요/);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      const splitTodos = stored.todos.filter((todo: { id: string }) => todo.id === "class-prep" || todo.id.startsWith("class-prep-split-"));
      expect(splitTodos).toHaveLength(2);
      expect(splitTodos.every((todo: { scheduledDate: string }) => todo.scheduledDate < "2026-07-23")).toBe(true);
    });
  });

  it("조정 질문의 날짜 답변을 이전 요청과 연결해 마감 전으로 재배치한다", async () => {
    const courseName = "부산재생캡스톤디자인";
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "capstone-class",
      itemType: "class-schedule",
      title: `${courseName} 수업`,
      courseName,
      date: null,
      confirmationStatus: "confirmed",
      reviewStatus: "confirmed",
      classMeetingTimes: [{ id: "thursday-class", weekday: 4, startTime: "12:00", endTime: "13:40", location: "401-1001" }],
    })]));
    localStorage.setItem("catchup.planning.v1", JSON.stringify({
      weeklyPlans: [{ id: "plan", userId: "user-demo-01", weekStartDate: "2026-07-20", weekEndDate: "2026-07-26", status: "complete", createdAt: "2026-07-20T09:00:00+09:00", generationRequest: "주간계획 생성", referenceWindowEndDate: "2026-08-16", summary: "7일 계획" }],
      todos: [{ id: "class-prep", weeklyPlanId: "plan", sourceExtractedItemId: "capstone-class", scheduledDate: "2026-07-24", title: `${courseName} 수업 준비`, todoType: "class-prep", courseName, estimatedDurationMinutes: 60, priority: "medium", isCompleted: false, recommendationReason: "수업 준비", durationRationale: ["시간표 기반"], carriedOverFromTodoId: null, taskPhase: "prepare", dependsOnTodoId: null }],
      todoIdsByWeeklyPlanId: { plan: ["class-prep"] },
      profile: { semesterWeekOneStartDate: null, confidenceByCourse: {}, pace: "average", preparationByEventId: {}, examGoalByEventId: {}, maxDailyStudyMinutes: 240 },
      adjustmentUsageByDate: {}, planAdjustments: [], pendingPlanUpdate: null,
    }));
    const modelResponse = {
      interpretationSummary: "마감일을 확인합니다.",
      operations: [],
      constraints: { maxDailyMinutes: null, maxTasksByWeekday: [], prohibitedWeekdays: [], preferredWeekdays: [] },
      warnings: [],
      questions: [`'${courseName} 수업 준비'의 마감일은 언제인가요?`],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => modelResponse });
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/today"]} />);

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: `'${courseName} 수업 준비' 계획을 다음의 요청사항을 반영해서 조정해줘: 마감일 반영해서 조정해줘` } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/마감일은 언제인가요/)).toBeInTheDocument();

    fireEvent.change(composer, { target: { value: "7/23일" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(await screen.findByText(/마감 전 날짜에 순서대로 분산했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/해당 요청을 이해하지 못했어요/)).not.toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      expect(stored.todos.find((todo: { id: string }) => todo.id === "class-prep").scheduledDate < "2026-07-23").toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("adds a course todo through a two-step conversation and keeps it out of plan adjustments", async () => {
    seedPlan();
    render(<App initialEntries={["/today"]} />);

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 추가" }));
    expect(await screen.findByText("어느 과목의 할 일을 추가할까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "행정기획론" }));

    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    const prefix = "[행정기획론] 과목에 대한 할 일을 다음의 제목을 바탕으로 추가해줘: ";
    expect(composer).toHaveValue(prefix);
    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
    fireEvent.change(composer, { target: { value: `${prefix}강의 노트 복습하기` } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(await screen.findByText("언제로 추가할까요? 날짜나 요일을 알려주세요.")).toBeInTheDocument();
    fireEvent.change(composer, { target: { value: "목요일" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    const addedMessage = await screen.findByText(/7월 23일에 '강의 노트 복습하기' 할 일을 추가했어요/);
    expect(addedMessage).not.toHaveTextContent("예상 소요시간");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      const added = stored.todos.find((todo: { title: string }) => todo.title === "강의 노트 복습하기");
      expect(added).toMatchObject({
        courseName: "행정기획론",
        scheduledDate: "2026-07-23",
        estimatedDurationMinutes: 0,
        planningParticipation: "calendar-only",
      });
      expect(added.durationRationale).toEqual([]);
      expect(added.sourceExtractedItemId).toMatch(/^calendar-only:/);
      expect(stored.adjustmentUsageByDate).toEqual({});
    });
    fireEvent.click(screen.getByRole("button", { name: "7월 23일 목요일" }));
    expect(await screen.findByRole("button", { name: "강의 노트 복습하기 AI Mate에서 보기" })).not.toHaveTextContent(/\d+(?:\.\d+)?[MH]/);
  });

  it("explains a selected task from stored recommendation details without charging", async () => {
    seedPlan(); render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: /행정기획론 보고서 자료 조사 AI Mate에서 보기/ }));
    fireEvent.click(screen.getByRole("button", { name: "할 일 추천이유" }));
    expect(await screen.findByText(/7월 26일 보고서 마감에 대비/)).toBeInTheDocument();
    expect(screen.getByText("조정 잔여 10회")).toBeInTheDocument();
  });

  it("asks only for missing personalization, applies an automatic update, and can undo it", async () => {
    seedPlan();
    const updated = academicEventFixture({ id: "report", title: "행정기획론 보고서", courseName: "행정기획론", date: "2026-07-24", workload: "보고서 10쪽", estimatedDurationMinutes: 180, reviewStatus: "confirmed", updatedAt: "2026-07-21T09:00:00+09:00" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([updated]));
    const planning = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
    planning.pendingPlanUpdate = { id: "pending", reasonKind: "assignment-updated", academicEventIds: ["report"], message: "새로운 과제 정보를 반영해 주간계획을 정리할게요.", detectedAt: "2026-07-21T09:00:00+09:00", noticeStatus: "unread", previousAcademicEvents: [{ ...updated, confirmationStatus: "unconfirmed" }] };
    localStorage.setItem("catchup.planning.v1", JSON.stringify(planning));
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("질문이 있어요!");
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    expect(await screen.findByText(/새로 확정된 학업 이벤트/)).toBeInTheDocument();
    expect(await screen.findByText(/바로 시작할 수 있나요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "바로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/행정기획론 보고서의 새 정보를 반영해/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("조정 잔여 9회")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "아냐, 취소해줘" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "아냐, 취소해줘" }));
    expect(await screen.findByText(/자동 조정 전 주간계획으로 되돌렸어요/)).toBeInTheDocument();
    expect(screen.getByText("조정 잔여 9회")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").todos[0].scheduledDate).toBe("2026-07-20"));
  });

  it("acknowledges a personalization answer before continuing the pending plan update", async () => {
    seedPlan();
    const updated = academicEventFixture({
      id: "report",
      title: "건축환경 과제",
      courseName: "건축환경",
      date: "2026-07-24",
      estimatedDurationMinutes: null,
      difficulty: "low",
      reviewStatus: "confirmed",
    });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([updated]));
    const planning = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
    planning.pendingPlanUpdate = {
      id: "confidence-update",
      reasonKind: "assignment-updated",
      academicEventIds: ["report"],
      message: "새로 확정된 학업 이벤트가 있어요.",
      detectedAt: "2026-07-21T09:00:00+09:00",
      noticeStatus: "unread",
      previousAcademicEvents: [{ ...updated, confirmationStatus: "unconfirmed" }],
    };
    localStorage.setItem("catchup.planning.v1", JSON.stringify(planning));

    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    expect(await screen.findByText(/건축환경 과목은 어느 정도 자신/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "보통" }));
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(await screen.findByText("알겠어요! 답변을 저장했어요. 주간계획에 반영할 내용을 이어서 확인할게요.")).toBeInTheDocument();
    expect(await screen.findByText(/건축환경 과제의 새 정보/)).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      expect(stored.planAdjustments[0].noticeStatus).toBe("reviewed");
    });
    expect(screen.getAllByText(/건축환경 과제의 새 정보/)).toHaveLength(1);
  });

  it("이미 확정된 이벤트의 중요 정보 변경은 불필요한 질문 없이 자동 반영한다", async () => {
    const user = userEvent.setup();
    seedPlan();
    const updated = academicEventFixture({ id: "report", title: "행정기획론 보고서", courseName: "행정기획론", date: "2026-07-24", workload: "보고서 10쪽", estimatedDurationMinutes: 180, difficulty: "high", reviewStatus: "confirmed" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([updated]));
    const planning = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
    planning.pendingPlanUpdate = { id: "confirmed-update", reasonKind: "assignment-updated", academicEventIds: ["report"], message: "자동 정리", detectedAt: "2026-07-21T09:00:00+09:00", noticeStatus: "unread", previousAcademicEvents: [{ ...updated, date: "2026-07-26" }] };
    localStorage.setItem("catchup.planning.v1", JSON.stringify(planning));
    render(<App initialEntries={["/today"]} />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("업데이트 사항이 있어요!"));
    expect(screen.getByRole("status")).not.toHaveTextContent("질문이 있어요");
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").adjustmentUsageByDate[adjustmentUsageDate()]).toBe(1));
    await user.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    expect(await screen.findByText(/행정기획론 보고서의 새 정보/)).toBeInTheDocument();
    expect(screen.queryByText("현재 반영할 새로운 학업 정보가 없어요.")).not.toBeInTheDocument();
  });

  it("개인 일정이 할 일과 겹치면 질문이나 승인 없이 자동 조정하고 이유를 알린다", async () => {
    seedPlan(); const user = userEvent.setup(); render(<App initialEntries={["/today"]} />);
    await user.click(screen.getByRole("button", { name: "추가" }));
    await user.type(screen.getByRole("textbox", { name: "제목" }), "오늘 약속");
    fireEvent.change(screen.getByLabelText("시작"), { target: { value: "00:00" } });
    fireEvent.change(screen.getByLabelText("종료"), { target: { value: "23:59" } });
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("업데이트 사항이 있어요!");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      expect(stored.todos[0].scheduledDate).not.toBe("2026-07-20");
      expect(stored.adjustmentUsageByDate[adjustmentUsageDate()]).toBe(1);
    });
  });

  it("10회 한도에서는 자동 조정을 막고 내일 처리할 pending 정보를 유지한다", async () => {
    seedPlan();
    const planning = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
    planning.adjustmentUsageByDate = { [adjustmentUsageDate()]: 10 };
    localStorage.setItem("catchup.planning.v1", JSON.stringify(planning));
    const user = userEvent.setup(); render(<App initialEntries={["/today"]} />);
    await user.click(screen.getByRole("button", { name: "추가" }));
    await user.type(screen.getByRole("textbox", { name: "제목" }), "오늘 약속");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("내일 주간계획을 업데이트할게요");
    await user.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    expect(await screen.findByText(/오늘 가능한 조정횟수를 넘었어요/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").pendingPlanUpdate).not.toBeNull());
    expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").todos[0].scheduledDate).toBe("2026-07-20");
  });

  it("blocks an eleventh successful adjustment without changing the plan", async () => {
    seedPlan();
    const planning = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
    planning.adjustmentUsageByDate = { [adjustmentUsageDate()]: 10 };
    localStorage.setItem("catchup.planning.v1", JSON.stringify(planning));
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: /행정기획론 보고서 자료 조사 AI Mate에서 보기/ }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 수정" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "'행정기획론 보고서 자료 조사' 계획을 다음의 요청사항을 반영해서 조정해줘: 토요일로 옮겨줘." } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/조정 10회를 모두 사용/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").todos[0].scheduledDate).toBe("2026-07-20");
  });

  it("지원하지 않는 요청과 이미 생성된 계획에 정확한 안내를 제공한다", async () => {
    seedPlan(); render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "메롱" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/해당 요청을 이해하지 못했어요/)).toBeInTheDocument();
    fireEvent.change(composer, { target: { value: "주간계획 생성해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/이미 주간계획이 있어요.*주간계획 수정/)).toBeInTheDocument();
  });

  it("does not render timestamps and preserves IME composition", () => {
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    expect(screen.getByRole("dialog", { name: "AI Mate" }).querySelector("time")).toBeNull();
    fireEvent.compositionStart(composer); fireEvent.change(composer, { target: { value: "주간계획 생성" } });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", keyCode: 229, isComposing: true });
    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
  });
});
