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

  it("centers the Google icon in a frame above the connector", () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    expect(screen.getByTestId("google-calendar-icon-frame")).toContainElement(
      screen.getByRole("img", { name: "Google Calendar" }),
    );
    expect(screen.getByTestId("calendar-connector")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("prevents duplicate submission and moves to Today after Mock connection", async () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    expect(screen.getByRole("img", { name: "Google Calendar" })).toBeInTheDocument();
    expect(screen.queryByText(/개인 일정과 수업 시간을\s*함께 반영해요/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "캘린더 연결하기" }));
    expect(screen.getByRole("button", { name: "연결 중..." })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(screen.getByLabelText("이번 주 날짜 선택")).toBeInTheDocument();
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

    expect(screen.getByLabelText("이번 주 날짜 선택")).toBeInTheDocument();
  });

  it("allows the user to skip and explore Today without Calendar data", () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));

    expect(screen.getByLabelText("이번 주 날짜 선택")).toBeInTheDocument();
  });
});
