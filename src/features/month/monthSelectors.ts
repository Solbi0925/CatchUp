import { addIsoDays, provisionalAcademicEventTitle, resolveAcademicWeekRange } from "../../domain/academicWeek";
import type { CalendarEvent, ExtractedItem, PlanningProfile } from "../../domain/types";
import { getCourseCategoryKey, PERSONAL_CATEGORY_KEY } from "../calendar/calendarColors";

export interface MonthScheduleItem {
  id: string;
  eventId?: string;
  extractedItemId?: string;
  title: string;
  date: string;
  rangeEndDate?: string;
  startTime: string | null;
  endTime: string | null;
  source: "upload" | "google" | "catchup";
  categoryKey: string;
  courseName?: string;
  eventType: CalendarEvent["eventType"];
  isProvisional: boolean;
  temporalPrecision: "exact-date" | "academic-week";
}

export function buildMonthSchedules(
  extractedItems: readonly ExtractedItem[],
  calendarEvents: readonly CalendarEvent[],
  planningProfile: PlanningProfile,
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
      source: "upload" as const,
      categoryKey: getCourseCategoryKey(item.courseName),
      courseName: item.courseName,
      eventType: "class" as const,
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
        source: "upload" as const,
        categoryKey: getCourseCategoryKey(item.courseName),
        courseName: item.courseName,
        eventType: "class" as const,
        isProvisional: item.confirmationStatus === "unconfirmed",
        temporalPrecision: "exact-date" as const,
      })),
    ...weekItems,
    ...calendarEvents.map((event) => ({
      id: `calendar-${event.id}`,
      eventId: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
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
