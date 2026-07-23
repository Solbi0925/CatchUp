import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";

afterEach(cleanup);

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

describe("Upload and AI Mate integrated prototype", () => {
  it("uses the confirmed extracted items to create and adjust a weekly plan", async () => {
    render(<App initialEntries={["/upload"]} />);
    await prepareConfirmedUpload();

    fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
    expect(screen.getByRole("dialog", { name: "AI Mate" })).toBeInTheDocument();
    expect(screen.getByText("조정 잔여 10회")).toBeInTheDocument();

    const composer = screen.getByPlaceholderText("메시지를 입력하세요...");
    fireEvent.change(composer, { target: { value: "이번 주 계획 짜줘" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(screen.getByText("이번 주 계획 짜줘")).toBeInTheDocument();
    expect(screen.getByText("답변을 준비하고 있어요")).toBeInTheDocument();
    expect(
      await screen.findByText(
        /업로드 자료와 캘린더를 반영해\s*이번 주 계획을 생성했어요./,
        {},
        { timeout: 2_000 },
      ),
    ).toBeInTheDocument();

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
