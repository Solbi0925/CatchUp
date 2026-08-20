import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../domain/types";
import { isGoogleCalendarSyncStale, mergeGoogleCalendarSync, type GoogleCalendarSyncPayload } from "./googleCalendarRepository";

const manual: CalendarEvent = { id: "manual", userId: "user-demo-01", title: "직접 입력", date: "2026-08-21", startTime: "09:00", endTime: "10:00", isAllDay: false, eventType: "personal", source: "catchup", updatedAt: "2026-08-20T00:00:00Z" };
const google: CalendarEvent = { id: "google-old", userId: "user-demo-01", title: "이전 제목", date: "2026-08-22", startTime: null, endTime: null, isAllDay: true, eventType: "personal", source: "google-calendar", externalId: "external", externalCalendarId: "primary", externalUpdatedAt: "2026-08-19T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z" };
const base: GoogleCalendarSyncPayload = { upserts: [], deletedExternalKeys: [], replaceCalendarIds: [], removedCalendarIds: [], lastSyncAt: "2026-08-20T03:00:00Z", syncRangeStart: "2026-08-20", syncRangeEnd: "2027-02-20" };

describe("Google calendar repository merge", () => {
  it("updates Google events while preserving manual events with the same title", () => {
    const result = mergeGoogleCalendarSync([manual, google], { ...base, upserts: [{ ...google, id: "google-new", title: "직접 입력", source: "google-calendar", externalUpdatedAt: "2026-08-20T02:00:00Z" }] }, "user-demo-01");
    expect(result.find((event) => event.id === "manual")).toEqual(manual);
    expect(result.find((event) => event.id === "google-new")?.title).toBe("직접 입력");
    expect(result.find((event) => event.id === "google-old")).toBeUndefined();
  });

  it("removes only matching Google events for deletion, full replacement, and disconnect", () => {
    expect(mergeGoogleCalendarSync([manual, google], { ...base, deletedExternalKeys: ["primary:external"] }, "user-demo-01")).toEqual([manual]);
    expect(mergeGoogleCalendarSync([manual, google], { ...base, replaceCalendarIds: ["primary"] }, "user-demo-01")).toEqual([manual]);
    expect(mergeGoogleCalendarSync([manual, google], { ...base, removedCalendarIds: ["primary"] }, "user-demo-01")).toEqual([manual]);
  });

  it("uses the persisted last sync time as the stale threshold", () => {
    expect(isGoogleCalendarSyncStale({ lastSyncAt: "2026-08-20T00:00:00Z", staleAfterMs: 300_000 }, Date.parse("2026-08-20T00:04:59Z"))).toBe(false);
    expect(isGoogleCalendarSyncStale({ lastSyncAt: "2026-08-20T00:00:00Z", staleAfterMs: 300_000 }, Date.parse("2026-08-20T00:05:00Z"))).toBe(true);
  });
});
