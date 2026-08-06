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
          return (
            <div className="month-week" key={weekCells[0]?.date}>
              <div className="month-week__dates">
                {weekCells.map((cell) => {
                  const isSelected = cell.date === selectedDate;
                  const isToday = cell.date === todayDate;
                  const scheduleCount = schedulesByDate.get(cell.date)?.length ?? 0;
                  const schedules = schedulesByDate.get(cell.date) ?? [];
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
                      <span className="month-date__events" aria-hidden="true">
                        {schedules.slice(0, 2).map((schedule) => (
                          <span
                            className="month-date__event-chip"
                            data-category-key={schedule.categoryKey}
                            style={{ backgroundColor: resolveCategoryColor(schedule.categoryKey, categoryColorByKey) }}
                            key={schedule.id}
                          >
                            {schedule.title}
                          </span>
                        ))}
                        {schedules.length > 2 && <span className="month-date__more">+{schedules.length - 2}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
