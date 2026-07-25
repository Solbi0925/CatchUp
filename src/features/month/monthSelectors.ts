import type { CalendarEvent, ExtractedItem } from "../../domain/types";

export interface MonthScheduleItem {
  id: string;
  eventId?: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  source: "upload" | "google" | "catchup";
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
        title: item.title,
        date: item.date,
        startTime: item.time,
        endTime: null,
        source: "upload" as const,
      })),
    ...calendarEvents.map((event) => ({
      id: `calendar-${event.id}`,
      eventId: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      source: event.source === "catchup" ? ("catchup" as const) : ("google" as const),
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

export function getMonthDotCount(itemCount: number) {
  return Math.min(itemCount, 3);
}
