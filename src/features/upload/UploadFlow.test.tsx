import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../../app/App";

describe("Upload flow", () => {
  it("selects a file, extracts reviewable data, confirms it and returns to Upload", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    expect(screen.getByRole("heading", { name: "자료 업로드" })).toBeInTheDocument();
    const input = screen.getByLabelText("학업 자료 업로드");
    await user.upload(
      input,
      new File(["sample"], "강의계획서.pdf", { type: "application/pdf" }),
    );

    expect(screen.getByText("강의계획서.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "자료 분석하기" }));
    expect(screen.getByRole("button", { name: "분석 중..." })).toBeDisabled();

    await screen.findByText("확인 필요", {}, { timeout: 2_000 });
    await user.click(screen.getByRole("link", { name: /강의계획서\.pdf/ }));

    expect(
      screen.getByRole("heading", { name: "추출 결과 확인 및 수정" }),
    ).toBeInTheDocument();
    const titleInput = screen.getByLabelText("과제명");
    await user.clear(titleInput);
    await user.type(titleInput, "사용자 수정 UX 리서치 보고서");
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "자료 업로드" })).toBeInTheDocument();
    });
    expect(screen.getByText("추출 완료")).toBeInTheDocument();
    expect(screen.getByText("AI Mate에서 이번 주 계획을 만들어보세요")).toBeInTheDocument();
  });
});
