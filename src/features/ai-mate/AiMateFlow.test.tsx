import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../app/App";
import { academicEventFixture } from "../../test/academicEventFixture";
import { PrototypeStoreProvider } from "../../store/PrototypeStore";
import { AiMateLayer } from "./AiMateLayer";
import { AiMateProvider, GENERATE_PLAN_DRAFT, useAiMate } from "./AiMateProvider";
import { adjustmentUsageDate } from "../../domain/adjustmentUsage";

afterEach(cleanup);

function PromptChipHarness() {
  const { openWithDraft } = useAiMate();
  return <button type="button" onClick={() => openWithDraft("", [{ label: "할 일 추천이유", draft: "추천 이유를 알려줘" }])}>맥락 열기</button>;
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

  it("shows the coachmark and creates a persisted seven-day plan without initial personalization questions", async () => {
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
    expect(await screen.findByText(/오늘부터 7일 계획을 만들었어요/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").weeklyPlans).toHaveLength(1));
    expect(localStorage.getItem("catchup.planning.v1")).toContain("금요일에는 공부하지 않고 싶어");
  });

  it("최초 생성 문장에 수정형 추가 조건이 붙어도 생성으로 처리한다", async () => {
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
    expect(await screen.findByText(/오늘부터 7일 계획을 만들었어요/)).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
      expect(stored.weeklyPlans).toHaveLength(1);
      expect(stored.todos.filter((todo: { scheduledDate: string }) => todo.scheduledDate === "2026-07-23").length).toBeLessThanOrEqual(1);
      expect(stored.todos.filter((todo: { scheduledDate: string }) => todo.scheduledDate === "2026-07-24").length).toBeLessThanOrEqual(1);
    });
  });

  it("collects the semester start before generation so week-only events appear in Month", async () => {
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
    expect(await screen.findByText(/이번 학기 1주차는 언제 시작하나요/)).toBeInTheDocument();

    fireEvent.change(composer, { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/오늘부터 7일 계획을 만들었어요/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}").profile.semesterWeekOneStartDate).toBe("2026-06-01"));

    fireEvent.click(screen.getByRole("link", { name: "Today" }));
    expect(await screen.findByText("행정기획론 중간고사 주")).toBeInTheDocument();
    expect(screen.getByText("미확정 일정")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Month" }));
    expect((await screen.findAllByRole("button", { name: "행정기획론 중간고사 주" })).length).toBeGreaterThan(0);
  });

  it("skips personalization questions when duration inputs are already sufficient", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "known-work", estimatedDurationMinutes: 60, difficulty: "low", reviewStatus: "confirmed",
    })]));
    render(<App initialEntries={["/upload"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByRole("textbox", { name: "AI Mate 메시지" });
    fireEvent.change(composer, { target: { value: "주간계획 생성해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/오늘부터 7일 계획을 만들었어요/)).toBeInTheDocument();
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
