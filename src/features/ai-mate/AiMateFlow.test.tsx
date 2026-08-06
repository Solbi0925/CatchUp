import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../app/App";
import { PrototypeStoreProvider } from "../../store/PrototypeStore";
import { AiMateLayer } from "./AiMateLayer";
import { AiMateProvider, useAiMate } from "./AiMateProvider";

afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
});

async function prepareConfirmedUpload() {
  const fileInput = screen.getByLabelText("학업 자료 업로드");
  fireEvent.change(fileInput, {
    target: {
      files: [new File(["demo"], "강의계획서.pdf", { type: "application/pdf" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "자료 분석하기" }));
  const reviewLink = await screen.findByRole(
    "link",
    { name: /추출 결과 확인 및 수정/ },
    { timeout: 2_000 },
  );
  fireEvent.click(reviewLink);
  fireEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
  await screen.findByRole("heading", { name: "자료 업로드" });
}

function PromptChipHarness() {
  const { openWithDraft } = useAiMate();
  return (
    <button
      type="button"
      onClick={() =>
        openWithDraft("", [
          {
            label: "할 일 추천이유",
            draft: "ERD 실습 준비를 추천한 이유를 알려줘",
          },
        ])
      }
    >
      맥락 열기
    </button>
  );
}

describe("Upload and AI Mate integrated prototype", () => {
  it("shows contextual chips that only update the composer", () => {
    render(
      <MemoryRouter>
        <PrototypeStoreProvider>
          <AiMateProvider>
            <PromptChipHarness />
            <AiMateLayer showCoachmark={false} />
          </AiMateProvider>
        </PrototypeStoreProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "맥락 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "할 일 추천이유" }));

    expect(screen.getByRole("textbox", { name: "AI Mate 메시지" })).toHaveValue(
      "ERD 실습 준비를 추천한 이유를 알려줘",
    );
    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
  });

  it("does not render timestamps below messages", () => {
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));

    expect(
      screen.getByRole("dialog", { name: "AI Mate" }).querySelector("time"),
    ).toBeNull();
  });

  it("offers Calendar onboarding after an upload when Calendar is disconnected", async () => {
    sessionStorage.clear();
    render(<App initialEntries={["/upload"]} />);
    await prepareConfirmedUpload();

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    const composer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.change(composer, { target: { value: "이번 주 계획 짜줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(
      await screen.findByText(
        "개인 일정을 반영하려면 Google Calendar 연결이 필요해요.",
        {},
        { timeout: 2_000 },
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Calendar 연결하기" }));

    expect(
      await screen.findByRole("heading", { name: "Google Calendar 연결" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "AI Mate" })).not.toBeInTheDocument();
  });

  it("uses the confirmed extracted items to create and adjust a weekly plan", async () => {
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
    await prepareConfirmedUpload();

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    expect(screen.getByRole("dialog", { name: "AI Mate" })).toBeInTheDocument();
    expect(screen.getByText("안녕하세요! 여러분의 AI Mate 캐치예요.")).toBeInTheDocument();
    expect(screen.getByText(/개인 요구사항도 함께 알려주세요/)).toBeInTheDocument();
    expect(screen.getByText("조정 잔여 10회")).toBeInTheDocument();

    const composer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.change(composer, { target: { value: "이번 주 계획 짜줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(screen.getByText("이번 주 계획 짜줘")).toBeInTheDocument();
    expect(screen.getByText("답변을 준비하고 있어요")).toBeInTheDocument();
    expect(
      await screen.findByText(
        /업로드 자료와 캘린더를 반영해\s*이번 주 계획을 만들었어요./,
        {},
        { timeout: 2_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/바꾸거나 추가하고 싶은 할 일/)).toBeInTheDocument();

    fireEvent.change(composer, { target: { value: "월요일 할 일을 줄여줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(
      await screen.findByText(
        "요청한 날의 부담이 줄도록 계획을 조정했어요.",
        {},
        { timeout: 2_000 },
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("조정 잔여 9회")).toBeInTheDocument();
    });
  });

  it("keeps the input available when there is no upload and offers a route to Upload", async () => {
    render(<App initialEntries={["/today"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));

    const composer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.change(composer, { target: { value: "이번 주 계획 짜줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(
      await screen.findByText(
        "계획을 만들려면 먼저 학업 자료가 필요해요.",
        {},
        { timeout: 2_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload로 이동" })).toHaveAttribute(
      "href",
      "/upload",
    );
    expect(composer).not.toBeDisabled();

    fireEvent.click(screen.getByRole("link", { name: "Upload로 이동" }));
    expect(await screen.findByRole("heading", { name: "자료 업로드" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "AI Mate" })).not.toBeInTheDocument();
  });

  it("does not submit Korean text while the IME is still composing", () => {
    render(<App initialEntries={["/upload"]} />);
    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));

    const composer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.compositionStart(composer);
    fireEvent.change(composer, { target: { value: "주간계획 생성" } });
    fireEvent.keyDown(composer, {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
      isComposing: true,
    });

    expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
    expect(composer).toHaveValue("주간계획 생성");

    fireEvent.compositionEnd(composer);
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });

    expect(screen.getByLabelText("내 메시지")).toHaveTextContent("주간계획 생성");
    expect(composer).toHaveValue("");
  });

  it("renders the approved neutral AI Mate character asset", () => {
    render(<App initialEntries={["/upload"]} />);
    expect(screen.getByRole("img", { name: "AI Mate 캐릭터" })).toBeInTheDocument();
  });
});
