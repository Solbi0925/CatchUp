import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";

describe("Calendar onboarding flow", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
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

  it("starts the real Local Bridge OAuth flow without injecting mock events", () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    expect(screen.getByRole("img", { name: "Google Calendar" })).toBeInTheDocument();
    expect(screen.queryByText(/개인 일정과 수업 시간을\s*함께 반영해요/)).not.toBeInTheDocument();

    const connect = screen.getByRole("link", { name: "캘린더 연결하기" });
    expect(connect).toHaveAttribute("href", expect.stringContaining("/api/google-calendar/connect?returnTo="));
    expect(localStorage.getItem("catchup.calendar-events.v1")).toBeNull();
  });

  it("shows a clear message when OAuth approval is denied", () => {
    render(<App initialEntries={["/onboarding/calendar?googleCalendar=denied"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("연결이 승인되지 않았어요");
  });

  it("allows the user to skip and explore Today without Calendar data", () => {
    render(<App initialEntries={["/onboarding/calendar"]} />);

    fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));

    expect(screen.getByLabelText("이번 주 날짜 선택")).toBeInTheDocument();
  });
});
