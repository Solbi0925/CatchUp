import { describe, expect, it, vi } from "vitest";
import { createGoogleCalendarService, GoogleCalendarError, normalizeGoogleEvent } from "./googleCalendar.mjs";

class MemoryStore {
  value = null;
  async read() { return this.value ? structuredClone(this.value) : null; }
  async write(value) { this.value = structuredClone({ ...value, version: 1 }); }
  async clear() { this.value = null; }
}

const env = {
  GOOGLE_CLIENT_ID: "fake-client-id",
  GOOGLE_CLIENT_SECRET: "fake-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:4318/api/google-calendar/oauth/callback",
  CATCHUP_APP_URL: "http://localhost:5173/onboarding/calendar",
  CATCHUP_TIME_ZONE: "Asia/Seoul",
};
const fixedNow = () => new Date("2026-08-20T03:00:00.000Z");
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function connectedSession(overrides = {}) {
  return {
    version: 1,
    tokens: { accessToken: "fake-access", refreshToken: "fake-refresh", expiresAt: Date.parse("2026-08-20T05:00:00Z") },
    syncRange: { startDate: "2026-08-20", endDate: "2027-02-20", timeMin: "2026-08-20T03:00:00.000Z", timeMax: "2027-02-20T03:00:00.000Z" },
    calendars: {}, lastSyncAt: null, ...overrides,
  };
}

describe("Google Calendar normalization", () => {
  it("distinguishes all-day and timed events and expands recurring instances returned by Google", () => {
    const allDay = normalizeGoogleEvent({ id: "all-day", summary: "휴식", start: { date: "2026-08-21" }, end: { date: "2026-08-23" } }, "primary");
    const timed = normalizeGoogleEvent({ id: "timed", summary: "약속", start: { dateTime: "2026-08-21T14:00:00+09:00" }, end: { dateTime: "2026-08-21T16:00:00+09:00" }, updated: "2026-08-20T00:00:00Z" }, "primary");
    expect(allDay.events).toHaveLength(2);
    expect(allDay.events.every((event) => event.isAllDay && event.startTime === null)).toBe(true);
    expect(timed.events[0]).toMatchObject({ date: "2026-08-21", startTime: "14:00", endTime: "16:00", isAllDay: false, externalId: "timed" });
  });

  it("normalizes cancelled events as deletions", () => {
    expect(normalizeGoogleEvent({ id: "gone", status: "cancelled" }, "calendar-a")).toEqual({ deletedExternalKey: "calendar-a:gone", events: [] });
  });
});

describe("Google Calendar OAuth and synchronization", () => {
  it("creates an offline read-only OAuth request and rejects an invalid state", async () => {
    const store = new MemoryStore();
    const service = createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl: vi.fn() });
    const authorizationUrl = new URL(await service.beginAuthorization("http://localhost:5173/onboarding/calendar"));
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("scope")).toContain("calendar.events.readonly");
    await expect(service.completeAuthorization({ code: "code", state: "wrong", error: null })).rejects.toMatchObject({ code: "INVALID_OAUTH_STATE" });
  });

  it("exchanges the callback code and fixes the initial six-month range", async () => {
    const store = new MemoryStore();
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 3600 }));
    const service = createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl });
    const authorizationUrl = new URL(await service.beginAuthorization("http://localhost:5173/onboarding/calendar"));
    const redirect = await service.completeAuthorization({ code: "fake-code", state: authorizationUrl.searchParams.get("state"), error: null });
    expect(redirect).toContain("googleCalendar=connected");
    expect(store.value.syncRange).toMatchObject({ startDate: "2026-08-20", endDate: "2027-02-20" });
    expect(JSON.stringify(await service.status())).not.toContain("fake-access");
  });

  it("reports a redirect URI mismatch without exposing the token request", async () => {
    const store = new MemoryStore();
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: "redirect_uri_mismatch" }, 400));
    const service = createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl });
    const authorizationUrl = new URL(await service.beginAuthorization("http://localhost:5173/onboarding/calendar"));
    await expect(service.completeAuthorization({ code: "fake-code", state: authorizationUrl.searchParams.get("state"), error: null })).rejects.toMatchObject({ code: "REDIRECT_URI_MISMATCH" });
    expect(JSON.stringify(await service.status())).not.toContain("fake-code");
  });

  it("performs paginated initial sync and returns a sync token", async () => {
    const store = new MemoryStore(); store.value = connectedSession();
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/calendarList")) return json({ items: [{ id: "secondary", accessRole: "owner" }, { id: "primary", primary: true, accessRole: "owner" }] });
      if (!url.searchParams.get("pageToken")) return json({ items: [{ id: "one", summary: "첫 일정", start: { dateTime: "2026-08-21T10:00:00+09:00" }, end: { dateTime: "2026-08-21T11:00:00+09:00" } }], nextPageToken: "page-2" });
      return json({
        items: [{ id: "two", summary: "종일", start: { date: "2026-08-22" }, end: { date: "2026-08-23" } }],
        ...(url.searchParams.has("orderBy") ? {} : { nextSyncToken: "sync-1" }),
      });
    });
    const result = await createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl }).sync();
    expect(result.upserts).toHaveLength(2);
    expect(result.replaceCalendarIds).toEqual(["primary"]);
    expect(store.value.calendars.primary.syncToken).toBe("sync-1");
    const firstEventsUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(firstEventsUrl.pathname).toContain("/calendars/primary/events");
    expect(firstEventsUrl.searchParams.get("timeMin")).toBe("2026-08-20T03:00:00.000Z");
    expect(firstEventsUrl.searchParams.get("timeMax")).toBe("2027-02-20T03:00:00.000Z");
    expect(firstEventsUrl.searchParams.has("orderBy")).toBe(false);
  });

  it("uses incremental sync, applies deletion, and recovers from an expired sync token", async () => {
    const store = new MemoryStore(); store.value = connectedSession({ calendars: { primary: { syncToken: "old-sync" } } });
    let eventsCalls = 0;
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/calendarList")) return json({ items: [{ id: "primary", primary: true, accessRole: "owner" }] });
      eventsCalls += 1;
      if (url.searchParams.get("syncToken")) return json({ error: { code: 410 } }, 410);
      return json({ items: [{ id: "removed", status: "cancelled" }, { id: "new", summary: "새 일정", start: { date: "2026-08-23" }, end: { date: "2026-08-24" } }], nextSyncToken: "new-sync" });
    });
    const result = await createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl }).sync();
    expect(eventsCalls).toBe(2);
    expect(result.deletedExternalKeys).toEqual(["primary:removed"]);
    expect(result.replaceCalendarIds).toEqual(["primary"]);
    expect(store.value.calendars.primary.syncToken).toBe("new-sync");
  });

  it("refreshes an expired access token and deduplicates concurrent sync calls", async () => {
    const store = new MemoryStore(); store.value = connectedSession({ tokens: { accessToken: "expired", refreshToken: "fake-refresh", expiresAt: 0 } });
    let eventRequests = 0;
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.href.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "refreshed", expires_in: 3600 });
      if (url.pathname.endsWith("/calendarList")) return json({ items: [{ id: "primary", primary: true, accessRole: "owner" }] });
      eventRequests += 1;
      await Promise.resolve();
      return json({ items: [], nextSyncToken: "sync" });
    });
    const service = createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl });
    const [first, second] = await Promise.all([service.sync(), service.sync()]);
    expect(first).toEqual(second);
    expect(eventRequests).toBe(1);
    expect(store.value.tokens.accessToken).toBe("refreshed");
  });

  it("keeps the session when an API request fails and removes it on disconnect", async () => {
    const store = new MemoryStore(); store.value = connectedSession();
    const failing = createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl: vi.fn().mockResolvedValue(json({}, 500)) });
    await expect(failing.sync()).rejects.toBeInstanceOf(GoogleCalendarError);
    expect(store.value.tokens.refreshToken).toBe("fake-refresh");
    const service = createGoogleCalendarService({ env, store, now: fixedNow, fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })) });
    await service.disconnect();
    expect(store.value).toBeNull();
  });
});
