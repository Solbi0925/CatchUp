import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
export const GOOGLE_CALENDAR_SYNC_STALE_MS = 5 * 60 * 1000;
const SESSION_VERSION = 1;

export class GoogleCalendarError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "GoogleCalendarError";
    this.code = code;
    this.status = status;
  }
}

export class FileGoogleCalendarSessionStore {
  constructor(filePath = process.env.CATCHUP_GOOGLE_TOKEN_STORE_PATH || join(homedir(), ".catchup", "google-calendar-session.json")) {
    this.filePath = filePath;
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      return parsed?.version === SESSION_VERSION ? parsed : null;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new GoogleCalendarError("STORAGE_FAILED", "Google Calendar 연결 정보를 읽지 못했어요.");
    }
  }

  async write(value) {
    const directory = dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, JSON.stringify({ ...value, version: SESSION_VERSION }), { encoding: "utf8", mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.filePath);
      await chmod(this.filePath, 0o600);
    } catch {
      throw new GoogleCalendarError("STORAGE_FAILED", "Google Calendar 연결 정보를 안전하게 저장하지 못했어요.");
    }
  }

  async clear() {
    try { await unlink(this.filePath); }
    catch (error) {
      if (error?.code !== "ENOENT") throw new GoogleCalendarError("DISCONNECT_FAILED", "Google Calendar 연결 정보를 삭제하지 못했어요.");
    }
  }
}

function addMonths(date, amount) {
  const next = new Date(date);
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

function datePart(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function timePart(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.hour}:${byType.minute}`;
}

function addIsoDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function externalKey(calendarId, eventId) {
  return `${calendarId}:${eventId}`;
}

function internalEventId(calendarId, eventId, date, segment = "0") {
  const digest = createHash("sha256").update(`${calendarId}\0${eventId}\0${date}\0${segment}`).digest("hex").slice(0, 24);
  return `google-${digest}`;
}

/** Expands recurring instances (already flattened by singleEvents=true) and multi-day events into displayable internal events. */
export function normalizeGoogleEvent(event, calendarId, timeZone = "Asia/Seoul") {
  if (!event?.id) throw new GoogleCalendarError("NORMALIZATION_FAILED", "Google Calendar 일정 식별자가 없어요.", 502);
  if (event.status === "cancelled") return { deletedExternalKey: externalKey(calendarId, event.id), events: [] };
  const common = {
    title: typeof event.summary === "string" && event.summary.trim() ? event.summary.trim() : "제목 없는 일정",
    eventType: "personal",
    source: "google-calendar",
    externalId: event.id,
    externalCalendarId: calendarId,
    externalUpdatedAt: event.updated ?? null,
  };
  if (event.start?.date) {
    const exclusiveEnd = event.end?.date && event.end.date > event.start.date ? event.end.date : addIsoDays(event.start.date, 1);
    const events = [];
    for (let date = event.start.date, segment = 0; date < exclusiveEnd; date = addIsoDays(date, 1), segment += 1) {
      events.push({ ...common, id: internalEventId(calendarId, event.id, date, String(segment)), date, startTime: null, endTime: null, isAllDay: true });
    }
    return { deletedExternalKey: null, events };
  }
  if (!event.start?.dateTime || !event.end?.dateTime) throw new GoogleCalendarError("NORMALIZATION_FAILED", "Google Calendar 일정의 시작·종료 시간이 올바르지 않아요.", 502);
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new GoogleCalendarError("NORMALIZATION_FAILED", "Google Calendar 일정 시간이 올바르지 않아요.", 502);
  const startDate = datePart(start, timeZone);
  const endDate = datePart(new Date(end.getTime() - 1), timeZone);
  const events = [];
  for (let date = startDate, segment = 0; date <= endDate; date = addIsoDays(date, 1), segment += 1) {
    events.push({
      ...common,
      id: internalEventId(calendarId, event.id, date, String(segment)),
      date,
      startTime: date === startDate ? timePart(start, timeZone) : "00:00",
      endTime: date === endDate ? timePart(end, timeZone) : "23:59",
      isAllDay: false,
    });
  }
  return { deletedExternalKey: null, events };
}

function safeReturnTo(value, fallback) {
  try {
    const url = new URL(value || fallback);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)) return fallback;
    return url.toString();
  } catch { return fallback; }
}

function publicStatus(session, configured) {
  return {
    configured,
    connected: Boolean(session?.tokens?.refreshToken || session?.tokens?.accessToken),
    lastSyncAt: session?.lastSyncAt ?? null,
    syncRangeStart: session?.syncRange?.startDate ?? null,
    syncRangeEnd: session?.syncRange?.endDate ?? null,
    staleAfterMs: GOOGLE_CALENDAR_SYNC_STALE_MS,
    errorCode: session?.lastErrorCode ?? null,
  };
}

function parseGoogleError(response, fallbackCode, fallbackMessage) {
  if (response.status === 410) return new GoogleCalendarError("SYNC_TOKEN_EXPIRED", "Google Calendar 동기화 기준이 만료되어 전체 일정을 다시 확인할게요.", 410);
  if (response.status === 401) return new GoogleCalendarError("TOKEN_REFRESH_FAILED", "Google Calendar 인증이 만료됐어요. 다시 연결해주세요.", 401);
  return new GoogleCalendarError(fallbackCode, fallbackMessage, response.status >= 400 && response.status < 600 ? response.status : 502);
}

export function createGoogleCalendarService({
  env = process.env,
  fetchImpl = globalThis.fetch,
  store = new FileGoogleCalendarSessionStore(),
  now = () => new Date(),
} = {}) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const bridgePort = Number(env.CATCHUP_BRIDGE_PORT ?? 4318);
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim() || `http://localhost:${bridgePort}/api/google-calendar/oauth/callback`;
  const appUrl = env.CATCHUP_APP_URL?.trim() || "http://localhost:5173/onboarding/calendar";
  const timeZone = env.CATCHUP_TIME_ZONE?.trim() || "Asia/Seoul";
  const configured = Boolean(clientId && clientSecret && redirectUri);
  let syncInFlight = null;

  function assertConfigured() {
    if (!configured) throw new GoogleCalendarError("OAUTH_NOT_CONFIGURED", "Google Calendar 연결 환경변수가 설정되지 않았어요.", 503);
  }

  async function postToken(parameters, failureCode = "OAUTH_FAILED") {
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(parameters),
    });
    if (!response.ok) {
      let googleCode = "";
      try { googleCode = String((await response.json())?.error ?? ""); } catch { /* Use the safe fallback below. */ }
      if (googleCode === "redirect_uri_mismatch") throw new GoogleCalendarError("REDIRECT_URI_MISMATCH", "Google Cloud의 redirect URI가 현재 Local Bridge 주소와 일치하지 않아요.", 400);
      throw new GoogleCalendarError(failureCode, failureCode === "TOKEN_REFRESH_FAILED" ? "Google Calendar 인증이 만료됐어요. 다시 연결해주세요." : "Google Calendar 인증을 완료하지 못했어요.", response.status || 502);
    }
    return response.json();
  }

  async function ensureAccessToken(session) {
    if (session.tokens?.accessToken && Number(session.tokens.expiresAt ?? 0) > now().getTime() + 60_000) return session;
    if (!session.tokens?.refreshToken) throw new GoogleCalendarError("TOKEN_REFRESH_FAILED", "Google Calendar 인증이 만료됐어요. 다시 연결해주세요.", 401);
    const token = await postToken({ client_id: clientId, client_secret: clientSecret, refresh_token: session.tokens.refreshToken, grant_type: "refresh_token" }, "TOKEN_REFRESH_FAILED");
    const next = { ...session, tokens: { ...session.tokens, accessToken: token.access_token, expiresAt: now().getTime() + Number(token.expires_in ?? 3600) * 1000 } };
    await store.write(next);
    return next;
  }

  async function googleJson(url, accessToken) {
    let response;
    try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } }); }
    catch { throw new GoogleCalendarError("NETWORK_ERROR", "Google Calendar에 연결하지 못했어요. 인터넷 연결을 확인해주세요.", 503); }
    if (!response.ok) throw parseGoogleError(response, "CALENDAR_API_ERROR", "Google Calendar 일정을 불러오지 못했어요.");
    return response.json();
  }

  async function listPrimaryCalendar(accessToken) {
    const calendars = [];
    let pageToken = null;
    do {
      const url = new URL(`${CALENDAR_API_BASE}/users/me/calendarList`);
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("showHidden", "false");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await googleJson(url, accessToken);
      calendars.push(...(page.items ?? []).filter((calendar) => calendar?.id && calendar.primary === true && !calendar.deleted && calendar.accessRole !== "none"));
      pageToken = page.nextPageToken ?? null;
    } while (pageToken);
    const primaryCalendar = calendars[0];
    if (!primaryCalendar) throw new GoogleCalendarError("CALENDAR_API_ERROR", "Google Calendar의 기본 캘린더를 찾지 못했어요.", 502);
    return primaryCalendar;
  }

  async function listEventChanges(accessToken, calendarId, session, syncToken = null) {
    const upserts = [];
    const deletedExternalKeys = [];
    let pageToken = null;
    let nextSyncToken = null;
    do {
      const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "true");
      url.searchParams.set("maxResults", "2500");
      url.searchParams.set("timeZone", timeZone);
      if (syncToken) url.searchParams.set("syncToken", syncToken);
      else {
        url.searchParams.set("timeMin", session.syncRange.timeMin);
        url.searchParams.set("timeMax", session.syncRange.timeMax);
      }
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await googleJson(url, accessToken);
      for (const event of page.items ?? []) {
        const normalized = normalizeGoogleEvent(event, calendarId, timeZone);
        if (normalized.deletedExternalKey) deletedExternalKeys.push(normalized.deletedExternalKey);
        upserts.push(...normalized.events);
      }
      pageToken = page.nextPageToken ?? null;
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    if (!nextSyncToken) throw new GoogleCalendarError("CALENDAR_API_ERROR", "Google Calendar 동기화 기준을 받지 못했어요.", 502);
    return { upserts, deletedExternalKeys, nextSyncToken };
  }

  async function performSync() {
    assertConfigured();
    let session = await store.read();
    if (!session?.tokens) throw new GoogleCalendarError("NOT_CONNECTED", "Google Calendar가 연결되어 있지 않아요.", 409);
    session = await ensureAccessToken(session);
    const calendars = [await listPrimaryCalendar(session.tokens.accessToken)];
    const previousCalendarIds = Object.keys(session.calendars ?? {});
    const activeCalendarIds = calendars.map((calendar) => calendar.id);
    const removedCalendarIds = previousCalendarIds.filter((id) => !activeCalendarIds.includes(id));
    const upserts = [];
    const deletedExternalKeys = [];
    const replaceCalendarIds = [];
    const nextCalendars = {};
    for (const calendar of calendars) {
      const priorToken = session.calendars?.[calendar.id]?.syncToken ?? null;
      let changes;
      try { changes = await listEventChanges(session.tokens.accessToken, calendar.id, session, priorToken); }
      catch (error) {
        if (!(error instanceof GoogleCalendarError) || error.code !== "SYNC_TOKEN_EXPIRED") throw error;
        changes = await listEventChanges(session.tokens.accessToken, calendar.id, session, null);
        replaceCalendarIds.push(calendar.id);
      }
      if (!priorToken) replaceCalendarIds.push(calendar.id);
      upserts.push(...changes.upserts);
      deletedExternalKeys.push(...changes.deletedExternalKeys);
      nextCalendars[calendar.id] = { syncToken: changes.nextSyncToken };
    }
    const lastSyncAt = now().toISOString();
    const nextSession = { ...session, calendars: nextCalendars, lastSyncAt, lastErrorCode: null };
    await store.write(nextSession);
    return { upserts, deletedExternalKeys, replaceCalendarIds: [...new Set(replaceCalendarIds)], removedCalendarIds, lastSyncAt, syncRangeStart: session.syncRange.startDate, syncRangeEnd: session.syncRange.endDate };
  }

  return {
    redirectUri,
    async status() { return publicStatus(await store.read(), configured); },
    async beginAuthorization(returnTo) {
      assertConfigured();
      const state = randomBytes(32).toString("base64url");
      const session = await store.read();
      await store.write({ ...session, oauth: { state, returnTo: safeReturnTo(returnTo, appUrl), createdAt: now().toISOString() } });
      const url = new URL(AUTHORIZATION_ENDPOINT);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      return url.toString();
    },
    async completeAuthorization({ code, state, error }) {
      assertConfigured();
      const session = await store.read();
      const returnTo = safeReturnTo(session?.oauth?.returnTo, appUrl);
      const stateAge = session?.oauth?.createdAt ? now().getTime() - Date.parse(session.oauth.createdAt) : Number.POSITIVE_INFINITY;
      if (!session?.oauth?.state || !state || session.oauth.state !== state || stateAge < 0 || stateAge > 10 * 60 * 1000) throw new GoogleCalendarError("INVALID_OAUTH_STATE", "Google Calendar 연결 요청을 확인할 수 없어요. 다시 시도해주세요.", 400);
      if (error) return `${returnTo}${returnTo.includes("?") ? "&" : "?"}googleCalendar=denied`;
      if (!code) throw new GoogleCalendarError("OAUTH_FAILED", "Google Calendar 승인 코드가 없어요. 다시 시도해주세요.", 400);
      const token = await postToken({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
      if (!token.refresh_token && !session.tokens?.refreshToken) throw new GoogleCalendarError("OAUTH_FAILED", "Google Calendar의 오프라인 접근 권한을 받지 못했어요. 연결을 해제한 뒤 다시 승인해주세요.", 502);
      const start = now();
      const end = addMonths(start, 6);
      await store.write({
        ...session,
        oauth: null,
        tokens: { accessToken: token.access_token, refreshToken: token.refresh_token ?? session.tokens.refreshToken, expiresAt: now().getTime() + Number(token.expires_in ?? 3600) * 1000 },
        syncRange: { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), timeMin: start.toISOString(), timeMax: end.toISOString() },
        calendars: {}, connectedAt: now().toISOString(), lastSyncAt: null, lastErrorCode: null,
      });
      return `${returnTo}${returnTo.includes("?") ? "&" : "?"}googleCalendar=connected`;
    },
    async sync() {
      if (syncInFlight) return syncInFlight;
      syncInFlight = performSync().catch(async (error) => {
        const session = await store.read();
        if (session) await store.write({ ...session, lastErrorCode: error instanceof GoogleCalendarError ? error.code : "CALENDAR_API_ERROR" });
        throw error;
      }).finally(() => { syncInFlight = null; });
      return syncInFlight;
    },
    async disconnect() {
      assertConfigured();
      const session = await store.read();
      const accessToken = session?.tokens?.accessToken;
      if (accessToken) {
        try { await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }); }
        catch { /* Local token deletion still disconnects the app if Google is temporarily unreachable. */ }
      }
      await store.clear();
      return { connected: false };
    },
  };
}
