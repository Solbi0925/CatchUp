import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";
import { PrototypeStoreProvider } from "../../store/PrototypeStore";
import { MonthPage } from "./MonthPage";
import { academicEventFixture } from "../../test/academicEventFixture";

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
beforeEach(() => sessionStorage.clear());

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
    await user.click(screen.getByRole("button", { name: "추가" }));

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

  it("edits and deletes a visible personal mock event", async () => {
    const user = userEvent.setup();
    renderMonth();
    await user.click(
      screen.getByRole("button", { name: /2026년 7월 20일.*일정 1개/ }),
    );

    await user.click(screen.getByRole("button", { name: /팀 프로젝트 회의.*14:00/ }));

    const title = screen.getByRole("textbox", { name: "제목" });
    await user.clear(title);
    await user.type(title, "팀 프로젝트 회의 변경");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.getAllByText("팀 프로젝트 회의 변경").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /팀 프로젝트 회의 변경.*14:00/ }));
    await user.click(screen.getByRole("button", { name: "일정 삭제" }));
    expect(screen.queryByText("팀 프로젝트 회의 변경")).not.toBeInTheDocument();
  });

  it("Month에서는 반복 수업 일정을 숨긴다", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "class-month", itemType: "class-schedule", title: "도시건축 수업", courseName: "도시건축", date: null,
      confirmationStatus: "confirmed", classMeetingTimes: [{ id: "meeting-mon", weekday: 1, startTime: "10:30", endTime: "11:45", location: "401-930" }],
    })]));
    renderMonth();
    expect(screen.queryByText("도시건축 수업")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("catchup.academic-events.v2") ?? "[]")[0].title).toBe("도시건축 수업");
  });

  it("distinguishes a time-unknown AcademicEvent from a real all-day calendar event", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "time-unknown-month", title: "시간 미정 발표", itemType: "presentation", date: "2026-07-20", time: null,
      requirements: "발표 자료", confirmationStatus: "confirmed", reviewStatus: "confirmed",
    })]));
    localStorage.setItem("catchup.calendar-events.v1", JSON.stringify([{
      id: "real-all-day", userId: "user-demo-01", title: "실제 종일 일정", date: "2026-07-20",
      startTime: null, endTime: null, isAllDay: true, eventType: "personal", source: "catchup", updatedAt: "2026-07-19T00:00:00Z",
    }]));
    const user = userEvent.setup();
    renderMonth();
    await user.click(screen.getByRole("button", { name: /2026년 7월 20일/ }));
    expect(screen.getByRole("button", { name: /시간 미정 발표 시간 없음 선택/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실제 종일 일정 종일 선택/ })).toBeInTheDocument();
  });

  it("shares three event lanes between week ranges and single-day schedules, then opens hidden items with +N", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify(Array.from({ length: 5 }, (_, index) => academicEventFixture({
      id: `crowded-${index}`,
      title: `숨김 검증 일정 ${index + 1}`,
      date: "2026-07-22",
    }))));
    const user = userEvent.setup();
    const { container } = renderMonth();
    const lanes = [...container.querySelectorAll<HTMLElement>("[data-event-lane]")].map((element) => Number(element.dataset.eventLane));
    expect(Math.max(...lanes)).toBeLessThanOrEqual(3);
    const more = screen.getByRole("button", { name: /2026년 7월 22일 수요일 숨겨진 일정/ });
    await user.click(more);
    const dialog = screen.getByRole("dialog", { name: "7월 22일 일정" });
    expect(within(dialog).getByRole("heading", { name: "7월 22일 일정" })).toBeInTheDocument();
    expect(within(dialog).getAllByText(/숨김 검증 일정/)).toHaveLength(5);
  });

  it("edits an Upload-derived schedule without leaving Month", async () => {
    sessionStorage.setItem(
      "catchup:prototype:onboarding:v1",
      JSON.stringify({
        version: 1,
        introSeen: true,
        calendarStep: "connected",
        calendarConnected: true,
      }),
    );
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    fireEvent.change(screen.getByLabelText("학업 자료 업로드"), {
      target: {
        files: [new File(["demo"], "강의계획서.pdf", { type: "application/pdf" })],
      },
    });
    await user.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));
    await user.click(
      await screen.findByRole(
        "link",
        { name: "학업 이벤트 전체 확인 및 수정" },
        { timeout: 2_000 },
      ),
    );
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));
    await user.click(await screen.findByRole("link", { name: "Month" }));

    await user.click(screen.getByRole("button", { name: /2026년 7월 23일/ }));
    await user.click(screen.getByRole("button", { name: /UX 리서치 보고서.*23:59/ }));
    expect(screen.getByRole("dialog", { name: /학업 이벤트 수정/ })).toBeInTheDocument();

    const title = screen.getByRole("textbox", { name: "이벤트명" });
    await user.clear(title);
    await user.type(title, "UX 보고서 제출");
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));

    expect(screen.getAllByText("UX 보고서 제출").length).toBeGreaterThan(0);
    expect(screen.queryByText("Upload에서 수정")).not.toBeInTheDocument();
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
