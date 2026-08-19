import { addIsoDays, provisionalAcademicEventTitle, resolveAcademicWeekRange } from "../../domain/academicWeek";
import type { CalendarEvent, ExtractedItem, PlanningProfile } from "../../domain/types";
import type { ScheduleDisplayType } from "../calendar/ScheduleEditorDialog";
import { getCourseCategoryKey, PERSONAL_CATEGORY_KEY } from "../calendar/calendarColors";

export interface MonthScheduleItem {
  id: string;
  eventId?: string;
  extractedItemId?: string;
  classMeetingId?: string;
  title: string;
  date: string;
  rangeEndDate?: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  source: "upload" | "google" | "catchup";
  categoryKey: string;
  courseName?: string;
  eventType: ScheduleDisplayType;
  isProvisional: boolean;
  temporalPrecision: "exact-date" | "academic-week";
}

function calendarTypeForAcademicItem(item: ExtractedItem): ScheduleDisplayType {
  if (item.itemType === "exam" || item.itemType === "quiz") return "exam";
  if (item.itemType === "class-schedule") return "class";
  return "deadline";
}

export function buildMonthSchedules(
  extractedItems: readonly ExtractedItem[],
  calendarEvents: readonly CalendarEvent[],
  planningProfile: PlanningProfile,
  _visibleRange?: { startDate: string; endDate: string },
) {
  const weekItems = extractedItems.flatMap((item) => {
    if (item.itemType === "class-schedule" || item.date !== null) return [];
    const range = resolveAcademicWeekRange(item, planningProfile);
    if (!range) return [];
    return [{
      id: `upload-week-${item.id}`,
      extractedItemId: item.id,
      title: provisionalAcademicEventTitle(item.title),
      date: range.startDate,
      rangeEndDate: range.endDate,
      startTime: null,
      endTime: null,
      isAllDay: false,
      source: "upload" as const,
      categoryKey: getCourseCategoryKey(item.courseName),
      courseName: item.courseName,
      eventType: calendarTypeForAcademicItem(item),
      isProvisional: true,
      temporalPrecision: "academic-week" as const,
    }];
  });
  const items: MonthScheduleItem[] = [
    ...extractedItems
      .filter((item): item is ExtractedItem & { date: string } => item.date !== null)
      .map((item) => ({
        id: `upload-${item.id}`,
        extractedItemId: item.id,
        title: item.title,
        date: item.date,
        startTime: item.time,
        endTime: null,
        isAllDay: item.isAllDay === true,
        source: "upload" as const,
        categoryKey: getCourseCategoryKey(item.courseName),
        courseName: item.courseName,
        eventType: calendarTypeForAcademicItem(item),
        isProvisional: item.confirmationStatus === "unconfirmed",
        temporalPrecision: "exact-date" as const,
      })),
    ...weekItems,
    ...calendarEvents.filter((event) => event.eventType !== "class").map((event) => ({
      id: `calendar-${event.id}`,
      eventId: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      source: event.source === "catchup" ? ("catchup" as const) : ("google" as const),
      categoryKey: event.eventType === "personal" ? PERSONAL_CATEGORY_KEY : getCourseCategoryKey(event.title),
      eventType: event.eventType,
      isProvisional: false,
      temporalPrecision: "exact-date" as const,
    })),
  ];

  return items.sort((a, b) =>
    `${a.date}-${a.startTime ?? ""}-${a.title}`.localeCompare(
      `${b.date}-${b.startTime ?? ""}-${b.title}`,
    ),
  );
}

export function groupSchedulesByDate(items: readonly MonthScheduleItem[]) {
  const grouped = new Map<string, MonthScheduleItem[]>();
  for (const item of items) {
    const endDate = item.rangeEndDate ?? item.date;
    for (let date = item.date; date <= endDate; date = addIsoDays(date, 1)) {
      grouped.set(date, [...(grouped.get(date) ?? []), item]);
    }
  }
  return grouped;
}
