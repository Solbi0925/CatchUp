import type { CalendarEvent } from "../domain/types";

const STORAGE_KEY = "catchup.calendar-events.v1";

export function readCalendarEvents(): CalendarEvent[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCalendarEvents(events: CalendarEvent[]) {
  if (!events.length) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}
