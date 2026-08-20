import type { MonthGridCell } from "./monthModel";
import type { MonthScheduleItem } from "./monthSelectors";
import { resolveCategoryColor, type CalendarCategoryColor } from "../calendar/calendarColors";
import { CalendarIcon, ChevronRightIcon } from "../../ui/icons";
import "./month.css";

const weekdays = [
  ["일", "일요일"],
  ["월", "월요일"],
  ["화", "화요일"],
  ["수", "수요일"],
  ["목", "목요일"],
  ["금", "금요일"],
  ["토", "토요일"],
] as const;

function getDateDetails(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return { year, month, day, weekday: weekdays[date.getUTCDay()][1] };
}

function formatKoreanDate(dateKey: string) {
  const { year, month, day, weekday } = getDateDetails(dateKey);
  return `${year}년 ${month}월 ${day}일 ${weekday}`;
}

function describeDate(
  cell: MonthGridCell,
  scheduleCount: number,
  isToday: boolean,
  isSelected: boolean,
) {
  const states = [
    !cell.isCurrentMonth && "다른 달",
    isToday && "오늘",
    isSelected && "선택됨",
  ].filter(Boolean);
  return `${formatKoreanDate(cell.date)}${
    states.length > 0 ? `, ${states.join(", ")}` : ""
  }, 일정 ${scheduleCount}개`;
}

export interface MonthCalendarProps {
  monthLabel: string;
  gridCells: readonly MonthGridCell[];
  schedulesByDate: ReadonlyMap<string, readonly MonthScheduleItem[]>;
  selectedDate: string;
  todayDate: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSelectDate: (date: string) => void;
  categoryColorByKey: Readonly<Record<string, CalendarCategoryColor>>;
}

const MAX_EVENT_LANES = 3;

interface PositionedSchedule {
  schedule: MonthScheduleItem;
  startIndex: number;
  endIndex: number;
  lane: number;
}

export function layoutWeekSchedules(
  weekCells: readonly MonthGridCell[],
  schedulesByDate: ReadonlyMap<string, readonly MonthScheduleItem[]>,
) {
  const uniqueSchedules = [...new Map(
    weekCells.flatMap((cell) => schedulesByDate.get(cell.date) ?? []).map((schedule) => [schedule.id, schedule]),
  ).values()].sort((left, right) =>
    Number(right.temporalPrecision === "academic-week") - Number(left.temporalPrecision === "academic-week") ||
    `${left.date}-${left.startTime ?? ""}-${left.title}`.localeCompare(`${right.date}-${right.startTime ?? ""}-${right.title}`),
  );
  const occupied = Array.from({ length: MAX_EVENT_LANES }, () => Array(7).fill(false) as boolean[]);
  const positioned: PositionedSchedule[] = [];
  const hiddenCountByDate = new Map<string, number>();

  for (const schedule of uniqueSchedules) {
    const endDate = schedule.rangeEndDate ?? schedule.date;
    const indexes = weekCells.flatMap((cell, index) => cell.date >= schedule.date && cell.date <= endDate ? [index] : []);
    if (indexes.length === 0) continue;
    const startIndex = indexes[0];
    const endIndex = indexes[indexes.length - 1];
    const lane = occupied.findIndex((slots) => indexes.every((index) => !slots[index]));
    if (lane < 0) {
      indexes.forEach((index) => hiddenCountByDate.set(weekCells[index].date, (hiddenCountByDate.get(weekCells[index].date) ?? 0) + 1));
      continue;
    }
    indexes.forEach((index) => { occupied[lane][index] = true; });
    positioned.push({ schedule, startIndex, endIndex, lane });
  }

  return { positioned, hiddenCountByDate };
}

export function MonthCalendar({
  monthLabel,
  gridCells,
  schedulesByDate,
  selectedDate,
  todayDate,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onSelectDate,
  categoryColorByKey,
}: MonthCalendarProps) {
  const weekCount = gridCells.length / 7;

  return (
    <section className="month-calendar" data-week-count={weekCount}>
      <header className="month-calendar__header">
        <h1>{monthLabel}</h1>
        <div className="month-calendar__actions">
          <button
            type="button"
            className="month-calendar__icon-button month-calendar__previous"
            aria-label="이전 달"
            onClick={onPreviousMonth}
          >
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            className="month-calendar__icon-button"
            aria-label="다음 달"
            onClick={onNextMonth}
          >
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            className="month-calendar__icon-button month-calendar__today-button"
            aria-label="오늘로 이동"
            onClick={onToday}
          >
            <CalendarIcon />
          </button>
        </div>
      </header>
      <div className="month-calendar__grid">
        <div className="month-calendar__weekdays">
          {weekdays.map(([shortLabel, fullLabel]) => (
            <span className="month-calendar__weekday-label" key={fullLabel}>
              <span aria-hidden="true">{shortLabel}</span>
              <span className="sr-only">{fullLabel}</span>
            </span>
          ))}
        </div>
        {Array.from({ length: weekCount }, (_, weekIndex) => {
          const weekCells = gridCells.slice(weekIndex * 7, weekIndex * 7 + 7);
          const { positioned, hiddenCountByDate } = layoutWeekSchedules(weekCells, schedulesByDate);
          return (
            <div className="month-week" key={weekCells[0]?.date}>
              <div className="month-week__dates">
                {weekCells.map((cell) => {
                  const isSelected = cell.date === selectedDate;
                  const isToday = cell.date === todayDate;
                  const scheduleCount = schedulesByDate.get(cell.date)?.length ?? 0;
                  const className = [
                    "month-date",
                    !cell.isCurrentMonth && "is-adjacent",
                    isToday && "is-today",
                    isSelected && "is-selected",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      type="button"
                      data-month-date={cell.date}
                      className={className}
                      aria-label={describeDate(
                        cell,
                        scheduleCount,
                        isToday,
                        isSelected,
                      )}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onSelectDate(cell.date)}
                      key={cell.date}
                    >
                      <span className="month-date__number">
                        {Number(cell.date.slice(-2))}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="month-week__events" aria-label="이번 주 일정">
                {positioned.map(({ schedule, startIndex, endIndex, lane }) => (
                  <button
                    type="button"
                    className={`month-week__event${schedule.temporalPrecision === "academic-week" ? " is-range" : ""}${schedule.isProvisional ? " is-provisional" : ""}`}
                    data-event-lane={lane + 1}
                    data-temporal-precision={schedule.temporalPrecision}
                    style={{
                      gridColumn: `${startIndex + 1} / ${endIndex + 2}`,
                      gridRow: lane + 1,
                      backgroundColor: resolveCategoryColor(schedule.categoryKey, categoryColorByKey),
                    }}
                    onClick={() => onSelectDate(schedule.date)}
                    key={schedule.id}
                  >{schedule.title}</button>
                ))}
              </div>
              <div className="month-week__more-layer" aria-label="숨겨진 일정">
                {weekCells.map((cell, index) => {
                  const hiddenCount = hiddenCountByDate.get(cell.date) ?? 0;
                  return hiddenCount > 0 ? <button type="button" style={{ gridColumn: index + 1 }} onClick={() => onSelectDate(cell.date)} aria-label={`${formatKoreanDate(cell.date)} 숨겨진 일정 ${hiddenCount}개`} key={cell.date}>+{hiddenCount}</button> : null;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
