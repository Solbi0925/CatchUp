import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeStoreProvider } from "../../store/PrototypeStore";
import { MonthPage } from "./MonthPage";

function renderMonth() {
  return render(
    <MemoryRouter>
      <PrototypeStoreProvider>
        <MonthPage />
      </PrototypeStoreProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("MonthPage", () => {
  it("renders the actual month grid and opens a selected date", async () => {
    const user = userEvent.setup();
    renderMonth();

    expect(screen.getByRole("heading", { name: "2026년 7월" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2026년 7월 25일/ }));
    expect(screen.getByRole("heading", { name: "7월 25일 일정" })).toBeInTheDocument();
  });

  it("validates and creates a personal mock event", async () => {
    const user = userEvent.setup();
    renderMonth();
    await user.click(screen.getByRole("button", { name: /2026년 7월 25일/ }));

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("일정 제목");

    await user.type(screen.getByPlaceholderText("일정 제목을 입력하세요"), "스터디");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getAllByText("스터디")).toHaveLength(2);
  });

  it("moves to the next month", async () => {
    const user = userEvent.setup();
    renderMonth();
    await user.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("heading", { name: "2026년 8월" })).toBeInTheDocument();
  });
});
