import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";

describe("Calendar onboarding flow", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("prevents duplicate submission and moves to Today after Mock connection", async () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    fireEvent.click(screen.getByRole("button", { name: "캘린더 연결하기" }));
    expect(screen.getByRole("button", { name: "연결 중..." })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(
      screen.getByRole("heading", { name: "오늘도 따라잡아볼까요? 👋" }),
    ).toBeInTheDocument();
  });

  it("shows a retry action after a deterministic first failure", async () => {
    render(<App initialEntries={["/onboarding/calendar?calendarMock=fail-once"]} />);

    fireEvent.click(screen.getByRole("button", { name: "캘린더 연결하기" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Calendar 연결에 실패했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(
      screen.getByRole("heading", { name: "오늘도 따라잡아볼까요? 👋" }),
    ).toBeInTheDocument();
  });

  it("allows the user to skip and explore Today without Calendar data", () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));

    expect(
      screen.getByRole("heading", { name: "오늘도 따라잡아볼까요? 👋" }),
    ).toBeInTheDocument();
  });
});
