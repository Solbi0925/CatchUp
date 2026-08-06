import {
  selectAllExtractedItems,
  selectCalendarEvents,
  selectCurrentWeeklyPlan,
  selectTodosForCurrentPlan,
} from "../../domain/selectors";
import type { ExtractedItem } from "../../domain/types";
import type { PrototypeState } from "../../store/prototypeReducer";
import { demoTodayDate } from "../../application/clock";
import type {
  TodayScheduleViewModel,
  TodayViewModel,
  WeekDayViewModel,
} from "./todayTypes";
import { getCourseCategoryKey, PERSONAL_CATEGORY_KEY } from "../calendar/calendarColors";

const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"] as const;

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function academicScheduleType(
  item: ExtractedItem,
): TodayScheduleViewModel["type"] {
  if (item.itemType === "exam") return "exam";
  if (item.itemType === "submission") return "submission";
  if (item.itemType === "notice" || item.itemType === "class-schedule") return "notice";
  return "deadline";
}

export function selectTodayViewModel(
  state: PrototypeState,
  selectedDate: string,
  todayDate = demoTodayDate,
): TodayViewModel {
  const plan = selectCurrentWeeklyPlan(state);
  const weekStart = plan?.weekStartDate ?? todayDate;
  const allTodos = selectTodosForCurrentPlan(state);
  const confirmedItems = selectAllExtractedItems(state).filter(
    (item) => item.reviewStatus === "confirmed",
  );
  const calendarEvents = selectCalendarEvents(state);
  const schedulesForDate = (date: string): TodayScheduleViewModel[] => [
    ...calendarEvents
      .filter((event) => event.date === date)
      .map((event) => ({
        id: event.id,
        title: event.title,
        timeLabel: event.isAllDay
          ? "종일"
          : [event.startTime, event.endTime].filter(Boolean).join("–"),
        type: "personal" as const,
        sourceLabel:
          event.source === "google-calendar"
            ? ("Google Calendar" as const)
            : ("CatchUp 직접 입력" as const),
        categoryKey: event.eventType === "personal" ? PERSONAL_CATEGORY_KEY : getCourseCategoryKey(event.title),
      })),
    ...confirmedItems
      .filter((item) => item.date === date)
      .map((item) => ({
        id: item.id,
        title: item.title,
        timeLabel: item.time ?? "종일",
        type: academicScheduleType(item),
        sourceLabel: "업로드 자료" as const,
        categoryKey: getCourseCategoryKey(item.courseName),
      })),
  ].sort((left, right) => left.timeLabel.localeCompare(right.timeLabel, "ko"));

  const days: WeekDayViewModel[] = weekdayLabels.map((weekdayLabel, index) => {
    const date = addDays(weekStart, index);
    return {
      date,
      weekdayLabel,
      dayOfMonth: Number(date.slice(8, 10)),
      isToday: date === todayDate,
      isSelected: date === selectedDate,
      todoCount: allTodos.filter((todo) => todo.scheduledDate === date).length,
      scheduleCount: schedulesForDate(date).length,
    };
  });

  return {
    selectedDate,
    weekStart,
    days,
    todos: allTodos
      .filter((todo) => todo.scheduledDate === selectedDate)
      .map((todo) => {
        const source = state.extractedItemsById[todo.sourceExtractedItemId];
        return {
          id: todo.id,
          title: todo.title,
          courseOrSource: todo.courseName,
          estimatedMinutes: todo.estimatedDurationMinutes,
          priority: todo.priority,
          completed: todo.isCompleted,
          dueAt: source?.date ?? null,
          recommendationSummary: todo.recommendationReason,
        };
      }),
    schedules: schedulesForDate(selectedDate),
    adjustmentRemaining: Math.max(
      0,
      10 - (state.adjustmentUsageByDate[todayDate] ?? 0),
    ),
  };
}
