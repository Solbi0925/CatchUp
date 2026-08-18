import {
  selectAllExtractedItems,
  selectScheduleAcademicItems,
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
import { provisionalAcademicEventTitle, resolveAcademicWeekRange } from "../../domain/academicWeek";
import { adjustmentUsageDate } from "../../domain/adjustmentUsage";

const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"] as const;

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function mondayOf(isoDate: string) {
  const weekday = weekdayOf(isoDate);
  return addDays(isoDate, -(weekday === 0 ? 6 : weekday - 1));
}

function academicScheduleType(
  item: ExtractedItem,
): TodayScheduleViewModel["type"] {
  if (item.itemType === "exam") return "exam";
  if (item.itemType === "class-schedule") return "notice";
  return "deadline";
}

export function selectTodayViewModel(
  state: PrototypeState,
  selectedDate: string,
  todayDate = demoTodayDate,
): TodayViewModel {
  const plan = selectCurrentWeeklyPlan(state);
  const weekStart = mondayOf(selectedDate);
  const allTodos = selectTodosForCurrentPlan(state);
  const academicItems = selectScheduleAcademicItems(state);
  const exactDateItems = academicItems.filter(
    (item): item is ExtractedItem & { date: string } => item.date !== null,
  );
  const provisionalWeekItems = academicItems.flatMap((item) => {
    if (item.itemType === "class-schedule" || item.date !== null) return [];
    const range = resolveAcademicWeekRange(item, state.planningProfile);
    return range ? [{ item, range }] : [];
  });
  const classScheduleItems = academicItems.filter(
    (item) => item.itemType === "class-schedule" && item.classMeetingTimes.length > 0,
  );
  const calendarEvents = selectCalendarEvents(state);
  const schedulesForDate = (date: string): TodayScheduleViewModel[] => [
    ...calendarEvents
      .filter((event) => event.date === date)
      .map((event) => ({
        id: event.id,
        calendarEventId: event.id,
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
        isProvisional: false,
      })),
    ...exactDateItems
      .filter((item) => item.date === date)
      .map((item) => ({
        id: item.id,
        extractedItemId: item.id,
        title: item.title,
        timeLabel: item.time ?? "종일",
        type: academicScheduleType(item),
        sourceLabel: "업로드 자료" as const,
        categoryKey: getCourseCategoryKey(item.courseName),
        isProvisional: item.confirmationStatus === "unconfirmed",
      })),
    ...provisionalWeekItems
      .filter(({ range }) => date >= range.startDate && date <= range.endDate)
      .map(({ item }) => ({
        id: `${item.id}:academic-week:${date}`,
        extractedItemId: item.id,
        title: provisionalAcademicEventTitle(item.title),
        timeLabel: "미확정 일정",
        type: academicScheduleType(item),
        sourceLabel: "업로드 자료" as const,
        categoryKey: getCourseCategoryKey(item.courseName),
        isProvisional: true,
      })),
    ...classScheduleItems.flatMap((item) => item.classMeetingTimes
      .filter((meeting) => meeting.weekday === weekdayOf(date))
      .map((meeting) => ({
        id: `${item.id}:${meeting.id}`,
        extractedItemId: item.id,
        classMeetingId: meeting.id,
        title: meeting.location ? `${item.title} · ${meeting.location}` : item.title,
        timeLabel: `${meeting.startTime}–${meeting.endTime}`,
        type: "class" as const,
        sourceLabel: "업로드 자료" as const,
        categoryKey: getCourseCategoryKey(item.courseName),
        isProvisional: false,
      }))),
  ].sort((left, right) => {
    const rank = (item: TodayScheduleViewModel) => item.isProvisional ? 2 : item.timeLabel === "종일" ? 1 : 0;
    return rank(left) - rank(right) || left.timeLabel.localeCompare(right.timeLabel, "ko");
  });

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
      isInPlanRange: Boolean(plan && date >= plan.weekStartDate && date <= plan.weekEndDate),
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
      10 - (state.adjustmentUsageByDate[adjustmentUsageDate()] ?? 0),
    ),
  };
}
