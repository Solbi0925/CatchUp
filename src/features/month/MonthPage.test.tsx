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
    await user.click(screen.getByRole("button", { name: "일정 추가" }));

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("일정 제목");

    await user.type(screen.getByRole("textbox", { name: "제목" }), "스터디");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getAllByText("스터디").length).toBeGreaterThan(0);
  });

  it("shows schedule titles directly on the calendar", async () => {
    const user = userEvent.setup();
    const { container } = renderMonth();

    expect(screen.getAllByText("팀 프로젝트 회의").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-calendar-dot]")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: /2026년 7월 20일.*일정 1개/ }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /2026년 7월 20일.*일정 1개/ }),
    );
    expect(screen.getAllByText("팀 프로젝트 회의").length).toBeGreaterThan(0);
  });

  it("edits a Google mock event without exposing delete", async () => {
    const user = userEvent.setup();
    renderMonth();
    await user.click(
      screen.getByRole("button", { name: /2026년 7월 20일.*일정 1개/ }),
    );

    expect(
      screen.queryByRole("button", { name: "팀 프로젝트 회의 삭제" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /팀 프로젝트 회의.*14:00/ }));

    const title = screen.getByRole("textbox", { name: "제목" });
    await user.clear(title);
    await user.type(title, "팀 프로젝트 회의 변경");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.getAllByText("팀 프로젝트 회의 변경").length).toBeGreaterThan(0);
  });

  it("moves to the next month", async () => {
    const user = userEvent.setup();
    renderMonth();
    await user.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("heading", { name: "2026년 8월" })).toBeInTheDocument();
  });

  it("distributes every week row evenly in a five-week month", async () => {
    const user = userEvent.setup();
    const { container } = renderMonth();

    await user.click(screen.getByRole("button", { name: "다음 달" }));
    await user.click(screen.getByRole("button", { name: "다음 달" }));

    expect(screen.getByRole("heading", { name: "2026년 9월" })).toBeInTheDocument();
    expect(container.querySelector(".month-calendar")).toHaveAttribute(
      "data-week-count",
      "5",
    );
    expect(
      getComputedStyle(container.querySelector(".month-calendar__grid")!)
        .gridAutoRows,
    ).toBe("1fr");
  });
});
