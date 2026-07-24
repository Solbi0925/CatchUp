import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMonthGrid } from "./monthModel";
import type { MonthScheduleItem } from "./monthSelectors";
import { MonthCalendar, type MonthCalendarProps } from "./MonthCalendar";

afterEach(() => {
  cleanup();
});

function schedule(
  id: string,
  date: string,
  title = "알고리즘 과제",
): MonthScheduleItem {
  return {
    id,
    sourceItemId: id,
    title,
    date,
    startTime: null,
    endTime: null,
    isAllDay: true,
    source: "extracted-item",
    sourceLabel: "업로드 자료",
    itemType: "deadline",
    documentId: "document-1",
    editable: false,
  };
}

function createProps(
  overrides: Partial<MonthCalendarProps> = {},
): MonthCalendarProps {
  return {
    monthKey: "2026-07",
    monthLabel: "2026년 7월",
    gridCells: buildMonthGrid("2026-07"),
    schedulesByDate: new Map<string, MonthScheduleItem[]>(),
    selectedDate: "2026-07-10",
    todayDate: "2026-07-20",
    onPreviousMonth: vi.fn(),
    onNextMonth: vi.fn(),
    onToday: vi.fn(),
    onSelectDate: vi.fn(),
    ...overrides,
  };
}

describe("MonthCalendar", () => {
  it.each([
    ["2026-02", "2026년 2월", 28],
    ["2026-07", "2026년 7월", 35],
    ["2026-08", "2026년 8월", 42],
  ])(
    "renders the Sunday-first weekday header and supplied grid for %s",
    (monthKey, monthLabel, cellCount) => {
      render(
        <MonthCalendar
          {...createProps({
            monthKey,
            monthLabel,
            gridCells: buildMonthGrid(monthKey),
          })}
        />,
      );

      const weekdayNames = [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일",
      ];

      weekdayNames.forEach((name) => {
        expect(
          screen.getByText(name, {
            selector: ".month-calendar__weekday-label .sr-only",
          }),
        ).toBeInTheDocument();
      });
      expect(screen.getAllByRole("button", { name: /일정 \d+개$/ })).toHaveLength(cellCount);
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
      expect(screen.queryByRole("gridcell")).not.toBeInTheDocument();
    },
  );

  it("calls previous, next, and today navigation callbacks", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MonthCalendar {...props} />);

    await user.click(screen.getByRole("button", { name: "이전 달" }));
    await user.click(screen.getByRole("button", { name: "다음 달" }));
    await user.click(screen.getByRole("button", { name: "오늘로 이동" }));

    expect(props.onPreviousMonth).toHaveBeenCalledOnce();
    expect(props.onNextMonth).toHaveBeenCalledOnce();
    expect(props.onToday).toHaveBeenCalledOnce();
  });

  it("exposes adjacent, today, and selected states with full Korean date names", () => {
    const schedulesByDate = new Map<string, MonthScheduleItem[]>([
      [
        "2026-07-10",
        [
          schedule("selected-1", "2026-07-10"),
          schedule("selected-2", "2026-07-10", "중간고사"),
        ],
      ],
    ]);
    render(<MonthCalendar {...createProps({ schedulesByDate })} />);

    const adjacent = screen.getByRole("button", {
      name: "2026년 6월 28일 일요일, 다른 달, 일정 0개",
    });
    const selected = screen.getByRole("button", {
      name: "2026년 7월 10일 금요일, 선택됨, 일정 2개",
    });
    const today = screen.getByRole("button", {
      name: "2026년 7월 20일 월요일, 오늘, 일정 0개",
    });

    expect(adjacent).toHaveClass("is-adjacent");
    expect(selected).toHaveClass("is-selected");
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today).toHaveClass("is-today");
  });

  it("selects the correct ISO date from both a date and its representative chip", async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    const schedulesByDate = new Map<string, MonthScheduleItem[]>([
      ["2026-07-17", [schedule("deadline", "2026-07-17", "알고리즘 과제")]],
    ]);
    render(
      <MonthCalendar
        {...createProps({ onSelectDate, schedulesByDate })}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "2026년 7월 17일 금요일, 일정 1개",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "알고리즘 과제, 2026년 7월 17일 금요일 일정 보기",
      }),
    );

    expect(onSelectDate).toHaveBeenNthCalledWith(1, "2026-07-17");
    expect(onSelectDate).toHaveBeenNthCalledWith(2, "2026-07-17");
  });

  it("hides zero dots and caps visible schedule dots at three", () => {
    const schedulesByDate = new Map<string, MonthScheduleItem[]>([
      [
        "2026-07-21",
        Array.from({ length: 4 }, (_, index) =>
          schedule(`schedule-${index}`, "2026-07-21", `샘플 일정 ${index + 1}`),
        ),
      ],
    ]);
    render(<MonthCalendar {...createProps({ schedulesByDate })} />);

    const emptyDate = screen.getByRole("button", {
      name: "2026년 7월 22일 수요일, 일정 0개",
    });
    const busyDate = screen.getByRole("button", {
      name: "2026년 7월 21일 화요일, 일정 4개",
    });

    expect(emptyDate.querySelectorAll("[data-calendar-dot]")).toHaveLength(0);
    expect(busyDate.querySelectorAll("[data-calendar-dot]")).toHaveLength(3);
  });

  it("keeps chips in a weekly event lane and clamps Friday and Saturday spans", () => {
    const schedulesByDate = new Map<string, MonthScheduleItem[]>([
      ["2026-07-17", [schedule("friday", "2026-07-17", "금요일 마감")]],
      ["2026-07-18", [schedule("saturday", "2026-07-18", "토요일 시험")]],
    ]);
    render(<MonthCalendar {...createProps({ schedulesByDate })} />);

    const friday = screen.getByRole("button", {
      name: "금요일 마감, 2026년 7월 17일 금요일 일정 보기",
    });
    const saturday = screen.getByRole("button", {
      name: "토요일 시험, 2026년 7월 18일 토요일 일정 보기",
    });

    expect(friday.closest(".month-event-lane")).toBe(saturday.closest(".month-event-lane"));
    expect(friday.closest('[role="gridcell"]')).toBeNull();
    expect(friday).toHaveStyle({ gridColumn: "6 / span 2" });
    expect(saturday).toHaveStyle({ gridColumn: "7 / span 1" });
  });
});
