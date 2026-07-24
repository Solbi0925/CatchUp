import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../../domain/types";
import { connectMockCalendar } from "./mockCalendarConnector";

describe("mock calendar connector", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Google Calendar events only", async () => {
    vi.useFakeTimers();
    const connection = connectMockCalendar({ scenario: "success", attempt: 1 });

    await vi.advanceTimersByTimeAsync(650);

    await expect(connection).resolves.toSatisfy((result: { events: CalendarEvent[] }) =>
      result.events.every((event) => event.source === "google-calendar"),
    );
  });
});
