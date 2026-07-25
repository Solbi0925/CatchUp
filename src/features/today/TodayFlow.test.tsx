import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";

describe("Today screen", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(cleanup);

  it("shows the Calendar connection empty state from the shared store", () => {
    render(<App initialEntries={["/today"]} />);

    expect(
      screen.getByRole("heading", { name: "오늘도 따라잡아볼까요? 👋" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("개인 일정을 불러오려면 Google Calendar 연결이 필요해요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "연결하기" })).toHaveAttribute(
      "href",
      "/onboarding/calendar",
    );
  });

  it("offers Upload when Calendar is connected but there are no documents", () => {
    sessionStorage.setItem(
      "catchup:prototype:onboarding:v1",
      JSON.stringify({
        version: 1,
        introSeen: true,
        calendarStep: "connected",
        calendarConnected: true,
      }),
    );
    render(<App initialEntries={["/today"]} />);

    expect(screen.getByText("아직 업로드된 자료가 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload로 이동" })).toHaveAttribute(
      "href",
      "/upload",
    );
  });

  it("opens AI Mate with a plan-generation draft after an upload is confirmed", async () => {
    sessionStorage.setItem(
      "catchup:prototype:onboarding:v1",
      JSON.stringify({
        version: 1,
        introSeen: true,
        calendarStep: "connected",
        calendarConnected: true,
      }),
    );
    render(<App initialEntries={["/upload"]} />);

    fireEvent.change(screen.getByLabelText("학업 자료 업로드"), {
      target: {
        files: [new File(["demo"], "강의계획서.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "자료 분석하기" }));
    fireEvent.click(
      await screen.findByRole("link", { name: /추출 결과 확인 및 수정/ }, { timeout: 2_000 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    fireEvent.click(await screen.findByRole("link", { name: "Today" }));

    expect(screen.getByText("아직 이번 주 할 일이 없어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI Mate에서 계획 생성" }));

    expect(screen.getByRole("dialog", { name: "AI Mate" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("메시지를 입력하세요...")).toHaveValue(
      "이번 주 계획을 생성해줘",
    );
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(
      /업로드 자료와 캘린더를 반영해\s*이번 주 계획을 생성했어요./,
      {},
      { timeout: 2_000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 닫기" }));

    expect(screen.getByRole("heading", { name: "오늘의 할 일" })).toBeInTheDocument();
    expect(screen.getByText(/ERD 실습 준비/)).toBeInTheDocument();
    expect(screen.getByText("팀 프로젝트 회의")).toBeInTheDocument();

    const completionCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(completionCheckbox);
    expect(completionCheckbox).toBeChecked();
    expect(screen.getByText(/조정 잔여 10회/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const adjustmentComposer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.change(adjustmentComposer, { target: { value: "월요일 할 일을 줄여줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(
      "요청한 날의 부담이 줄도록 계획을 조정했어요.",
      {},
      { timeout: 2_000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 닫기" }));

    expect(screen.getByText(/조정 잔여 9회/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7월 21일 화요일" }));
    expect(screen.getByText(/정규화 개념 퀴즈/)).toBeInTheDocument();
  });
});
