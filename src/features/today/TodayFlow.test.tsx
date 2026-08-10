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

    expect(screen.queryByText("오늘도 따라잡아볼까요? 👋")).not.toBeInTheDocument();
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

  it("shows the simplified plan and lets AI Mate handle plan changes", async () => {
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

    expect(screen.getByText("아직 계획된 할 일이 없어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계획 생성하기" }));

    expect(screen.getByRole("dialog", { name: "AI Mate" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "AI Mate 메시지" })).toHaveValue(
      "오늘부터 7일 계획을 생성해줘",
    );
    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(
      /업로드 자료와 캘린더, 기존 미완료 할 일을 반영해\s*오늘부터 7일 계획을 만들었어요./,
      {},
      { timeout: 2_000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 닫기" }));

    expect(screen.getByRole("heading", { name: "오늘의 할 일" })).toBeInTheDocument();
    expect(screen.getAllByText(/ERD 실습 준비/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/우선순위/)).not.toBeInTheDocument();
    expect(screen.queryByText("추천 이유 보기")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추가" })).toBeInTheDocument();
    expect(screen.getByText("병원 예약")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ERD 실습 준비.*AI Mate/ }));
    expect(screen.getByRole("button", { name: "할 일 추천이유" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "할 일 조정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7\/22일 할 일 추가" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "할 일 추천이유" }));
    expect(
      (screen.getByRole("textbox", { name: "AI Mate 메시지" }) as HTMLTextAreaElement).value,
    ).toMatch(/ERD 실습 준비.*추천한 이유/);
    expect(screen.getAllByLabelText("내 메시지")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 닫기" }));

    const completionCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(completionCheckbox);
    expect(completionCheckbox).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const adjustmentComposer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.change(adjustmentComposer, { target: { value: "목요일 할 일을 줄여줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(
      "요청한 날의 부담이 줄도록 계획을 조정했어요.",
      {},
      { timeout: 2_000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 닫기" }));

    expect(screen.getByRole("button", { name: /7월 20일 월요일, 현재 7일 계획 범위 밖/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /다음 주/ }));
    expect(screen.getByRole("button", { name: /7월 27일 월요일/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /7월 29일 수요일, 현재 7일 계획 범위 밖/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /이전 주/ }));

    fireEvent.click(screen.getByRole("button", { name: /7월 23일 목요일/ }));
    expect(screen.getByText(/UX 리서치 보고서 검토하고 제출하기/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /7월 23일 목요일/ }));
    fireEvent.click(screen.getByRole("button", { name: /UX 리서치 보고서 일정 수정/ }));
    expect(screen.getByRole("dialog", { name: "일정 편집" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "제목" }), {
      target: { value: "UX 보고서 제출" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText("UX 보고서 제출")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /7월 26일 일요일/ }));
    fireEvent.click(screen.getByRole("button", { name: "계획 조정" }));
    expect(screen.getByRole("textbox", { name: "AI Mate 메시지" })).toHaveValue(
      "7/26일 계획을 조정해줘",
    );
    expect(screen.getAllByLabelText("내 메시지")).toHaveLength(2);
  });
});
