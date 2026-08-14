import { addIsoDays, provisionalAcademicEventTitle, resolveAcademicWeekRange } from "../../domain/academicWeek";
import type { CalendarEvent, ExtractedItem, PlanningProfile } from "../../domain/types";
import { getCourseCategoryKey, PERSONAL_CATEGORY_KEY } from "../calendar/calendarColors";

export interface MonthScheduleItem {
  id: string;
  eventId?: string;
  extractedItemId?: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  source: "upload" | "google" | "catchup";
  categoryKey: string;
  courseName?: string;
  eventType: CalendarEvent["eventType"];
  isProvisional: boolean;
  temporalPrecision: "exact-date" | "academic-week";
  rangePosition?: "start" | "middle" | "end";
}

export function buildMonthSchedules(
  extractedItems: readonly ExtractedItem[],
  calendarEvents: readonly CalendarEvent[],
  planningProfile: PlanningProfile,
) {
  const weekItems = extractedItems.flatMap((item) => {
    if (item.reviewStatus !== "confirmed" || item.itemType === "class-schedule" || item.date !== null) return [];
    const range = resolveAcademicWeekRange(item, planningProfile);
    if (!range) return [];
    return Array.from({ length: 7 }, (_, index) => ({
      id: `upload-week-${item.id}-${addIsoDays(range.startDate, index)}`,
      extractedItemId: item.id,
      title: provisionalAcademicEventTitle(item.title),
      date: addIsoDays(range.startDate, index),
      startTime: null,
      endTime: null,
      source: "upload" as const,
      categoryKey: getCourseCategoryKey(item.courseName),
      courseName: item.courseName,
      eventType: "class" as const,
      isProvisional: true,
      temporalPrecision: "academic-week" as const,
      rangePosition: index === 0 ? "start" as const : index === 6 ? "end" as const : "middle" as const,
    }));
  });
  const items: MonthScheduleItem[] = [
    ...extractedItems
      .filter((item): item is ExtractedItem & { date: string } => item.reviewStatus === "confirmed" && item.date !== null)
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
        isProvisional: false,
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
    grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
  }
  return grouped;
}
