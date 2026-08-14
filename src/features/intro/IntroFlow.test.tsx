import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";

describe("Intro flow", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the brand intro at the initial route", () => {
    render(<App initialEntries={["/"]} />);

    expect(screen.getByRole("heading", { name: "Catch Up" })).toBeInTheDocument();
    expect(screen.getByText(/오늘과 이번 주/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "하단 탐색" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI Mate 열기" })).not.toBeInTheDocument();
  });

  it("moves to Calendar onboarding after the intro delay", async () => {
    render(<App initialEntries={["/"]} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(
      screen.getByRole("heading", { name: "Google Calendar 연결" }),
    ).toBeInTheDocument();
  });

  it("sends an already onboarded session directly to Today", () => {
    sessionStorage.setItem(
      "catchup:prototype:onboarding:v1",
      JSON.stringify({
        version: 1,
        introSeen: true,
        calendarStep: "connected",
        calendarConnected: true,
      }),
    );

    render(<App initialEntries={["/"]} />);

    expect(screen.getByLabelText("이번 주 날짜 선택")).toBeInTheDocument();
  });

  it("clears the onboarding session when resetDemo is requested", () => {
    sessionStorage.setItem(
      "catchup:prototype:onboarding:v1",
      JSON.stringify({
        version: 1,
        introSeen: true,
        calendarStep: "connected",
        calendarConnected: true,
      }),
    );

    render(<App initialEntries={["/?resetDemo=1"]} />);

    expect(screen.getByRole("heading", { name: "Catch Up" })).toBeInTheDocument();
  });

  it("returns an unknown route to the initial flow", () => {
    render(<App initialEntries={["/does-not-exist"]} />);

    expect(screen.getByRole("heading", { name: "Catch Up" })).toBeInTheDocument();
  });
});
