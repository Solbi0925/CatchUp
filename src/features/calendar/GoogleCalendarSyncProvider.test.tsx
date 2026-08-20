import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeStoreProvider, usePrototypeStore } from "../../store/PrototypeStore";
import type { CalendarEventRepository, GoogleCalendarStatus, GoogleCalendarSyncPayload } from "./googleCalendarRepository";
import { GoogleCalendarSyncProvider, useGoogleCalendarSync } from "./GoogleCalendarSyncProvider";

const status: GoogleCalendarStatus = { configured: true, connected: true, lastSyncAt: null, syncRangeStart: "2026-08-20", syncRangeEnd: "2027-02-20", staleAfterMs: 300_000, errorCode: null };
const syncPayload: GoogleCalendarSyncPayload = {
  upserts: [{ id: "google-new", title: "동기화 일정", date: "2026-08-21", startTime: "14:00", endTime: "15:00", isAllDay: false, eventType: "personal", source: "google-calendar", externalId: "external", externalCalendarId: "primary", externalUpdatedAt: "2026-08-20T01:00:00Z" }],
  deletedExternalKeys: [], replaceCalendarIds: ["primary"], removedCalendarIds: [], lastSyncAt: "2026-08-20T03:00:00Z", syncRangeStart: "2026-08-20", syncRangeEnd: "2027-02-20",
};

function Probe() {
  const { state } = usePrototypeStore();
  const calendar = useGoogleCalendarSync();
  return <><span>{calendar.phase}</span><span data-testid="events">{Object.values(state.calendarEventsById).map((event) => event.id).sort().join(",")}</span><button onClick={() => void calendar.ensureFresh(true)}>sync</button></>;
}

function renderWith(repository: CalendarEventRepository) {
  return render(<PrototypeStoreProvider><GoogleCalendarSyncProvider repository={repository} autoInitialize={false}><Probe /></GoogleCalendarSyncProvider></PrototypeStoreProvider>);
}

afterEach(cleanup);

describe("GoogleCalendarSyncProvider", () => {
  it("deduplicates simultaneous sync and preserves manual events", async () => {
    localStorage.setItem("catchup.calendar-events.v1", JSON.stringify([{ id: "manual", userId: "user-demo-01", title: "직접 입력", date: "2026-08-21", startTime: null, endTime: null, isAllDay: false, eventType: "personal", source: "catchup", updatedAt: "2026-08-20T00:00:00Z" }]));
    const repository: CalendarEventRepository = { status: vi.fn().mockResolvedValue(status), sync: vi.fn().mockResolvedValue(syncPayload), disconnect: vi.fn(), connectUrl: vi.fn() };
    renderWith(repository);
    fireEvent.click(screen.getByRole("button", { name: "sync" }));
    fireEvent.click(screen.getByRole("button", { name: "sync" }));
    await waitFor(() => expect(screen.getByTestId("events")).toHaveTextContent("google-new,manual"));
    expect(repository.sync).toHaveBeenCalledTimes(1);
  });

  it("keeps previously stored events when the Google API fails", async () => {
    localStorage.setItem("catchup.calendar-events.v1", JSON.stringify([{ id: "google-old", userId: "user-demo-01", title: "저장 일정", date: "2026-08-21", startTime: null, endTime: null, isAllDay: true, eventType: "personal", source: "google-calendar", externalId: "old", externalCalendarId: "primary", updatedAt: "2026-08-20T00:00:00Z" }]));
    const repository: CalendarEventRepository = { status: vi.fn().mockResolvedValue(status), sync: vi.fn().mockRejectedValue(new Error("일시적 실패")), disconnect: vi.fn(), connectUrl: vi.fn() };
    renderWith(repository);
    fireEvent.click(screen.getByRole("button", { name: "sync" }));
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());
    expect(screen.getByTestId("events")).toHaveTextContent("google-old");
  });
});
