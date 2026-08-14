import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

  it("offers and applies a pending academic-information update", async () => {
    seedPlan();
    const updated = academicEventFixture({ id: "report", title: "행정기획론 보고서", courseName: "행정기획론", date: "2026-07-24", workload: "보고서 10쪽", estimatedDurationMinutes: 180, reviewStatus: "confirmed", updatedAt: "2026-07-21T09:00:00+09:00" });
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([updated]));
    const planning = JSON.parse(localStorage.getItem("catchup.planning.v1") ?? "{}");
    planning.pendingPlanUpdate = { id: "pending", reasonKind: "assignment-updated", academicEventIds: ["report"], message: "새로운 과제 정보를 반영해 주간계획을 업데이트할까요?", detectedAt: "2026-07-21T09:00:00+09:00" };
    localStorage.setItem("catchup.planning.v1", JSON.stringify(planning));
    render(<App initialEntries={["/today"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("새로운 과제 정보");
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "주간계획 업데이트" }));
    expect(await screen.findByText(/바로 시작할 수 있나요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "바로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    expect(await screen.findByText(/새로운 학업 정보를 반영해 미완료 주간계획을 업데이트/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("조정 잔여 9회")).toBeInTheDocument());
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
