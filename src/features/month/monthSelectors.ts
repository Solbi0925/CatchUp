import type { CalendarEvent, ExtractedItem } from "../../domain/types";
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
}

export function buildMonthSchedules(
  extractedItems: readonly ExtractedItem[],
  calendarEvents: readonly CalendarEvent[],
) {
  const items: MonthScheduleItem[] = [
    ...extractedItems
      .filter((item) => item.reviewStatus === "confirmed")
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
      })),
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
