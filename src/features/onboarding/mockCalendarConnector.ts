import { mockGoogleCalendarEvents } from "../../mocks/templates";
import type { CalendarEvent } from "../../domain/types";

export type CalendarMockScenario = "success" | "fail-once";

export interface CalendarConnectionResult {
  events: CalendarEvent[];
}

export function connectMockCalendar({
  scenario,
  attempt,
  signal,
}: {
  scenario: CalendarMockScenario;
  attempt: number;
  signal?: AbortSignal;
}): Promise<CalendarConnectionResult> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (scenario === "fail-once" && attempt === 1) {
        reject(new Error("mock-calendar-connection-failed"));
        return;
      }
      resolve({ events: mockGoogleCalendarEvents.map((event) => ({ ...event })) });
    }, 650);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
