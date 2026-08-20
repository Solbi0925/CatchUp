import type { CalendarEvent, UserId } from "../../domain/types";

export const GOOGLE_CALENDAR_SYNC_STALE_MS = 5 * 60 * 1000;

export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  syncRangeStart: string | null;
  syncRangeEnd: string | null;
  staleAfterMs: number;
  errorCode: string | null;
}

export interface GoogleCalendarSyncPayload {
  upserts: Array<Omit<CalendarEvent, "userId" | "updatedAt">>;
  deletedExternalKeys: string[];
  replaceCalendarIds: string[];
  removedCalendarIds: string[];
  lastSyncAt: string;
  syncRangeStart: string;
  syncRangeEnd: string;
}

export interface CalendarEventRepository {
  status(): Promise<GoogleCalendarStatus>;
  sync(): Promise<GoogleCalendarSyncPayload>;
  disconnect(): Promise<void>;
  connectUrl(returnTo: string): string;
}

export class GoogleCalendarRepositoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GoogleCalendarRepositoryError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: T | { error?: string; code?: string };
  try { payload = await response.json() as T | { error?: string; code?: string }; }
  catch { throw new GoogleCalendarRepositoryError("INVALID_RESPONSE", "Google Calendar 응답을 확인하지 못했어요."); }
  if (!response.ok) {
    const error = payload as { error?: string; code?: string };
    throw new GoogleCalendarRepositoryError(error.code ?? "CALENDAR_API_ERROR", error.error ?? "Google Calendar 요청에 실패했어요.");
  }
  return payload as T;
}

export class LocalBridgeGoogleCalendarRepository implements CalendarEventRepository {
  async status() {
    return parseResponse<GoogleCalendarStatus>(await fetch("/api/google-calendar/status", { headers: { Accept: "application/json" } }));
  }

  async sync() {
    return parseResponse<GoogleCalendarSyncPayload>(await fetch("/api/google-calendar/sync", { method: "POST", headers: { Accept: "application/json" } }));
  }

  async disconnect() {
    await parseResponse<{ connected: boolean }>(await fetch("/api/google-calendar/disconnect", { method: "POST", headers: { Accept: "application/json" } }));
  }

  connectUrl(returnTo: string) {
    return `/api/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`;
  }
}

function eventExternalKey(event: CalendarEvent) {
  return event.externalCalendarId && event.externalId ? `${event.externalCalendarId}:${event.externalId}` : null;
}

/** Applies a Google delta without ever removing CatchUp-created events. */
export function mergeGoogleCalendarSync(
  existing: readonly CalendarEvent[],
  payload: GoogleCalendarSyncPayload,
  userId: UserId,
) {
  const replaceCalendars = new Set([...payload.replaceCalendarIds, ...payload.removedCalendarIds]);
  const deleted = new Set(payload.deletedExternalKeys);
  const next = new Map(existing
    .filter((event) => event.source === "catchup"
      || (!replaceCalendars.has(event.externalCalendarId ?? "") && !deleted.has(eventExternalKey(event) ?? "")))
    .map((event) => [event.id, event]));
  const upsertKeys = new Set(payload.upserts.map((event) => event.externalCalendarId && event.externalId ? `${event.externalCalendarId}:${event.externalId}` : null).filter(Boolean));
  for (const [id, current] of next) {
    if (current.source === "google-calendar" && upsertKeys.has(eventExternalKey(current))) next.delete(id);
  }
  for (const event of payload.upserts) {
    if (event.source !== "google-calendar" || !event.externalId || !event.externalCalendarId) continue;
    next.set(event.id, { ...event, userId, updatedAt: payload.lastSyncAt });
  }
  return [...next.values()];
}

export function isGoogleCalendarSyncStale(status: Pick<GoogleCalendarStatus, "lastSyncAt" | "staleAfterMs">, now = Date.now()) {
  if (!status.lastSyncAt) return true;
  const last = Date.parse(status.lastSyncAt);
  return Number.isNaN(last) || now - last >= (status.staleAfterMs || GOOGLE_CALENDAR_SYNC_STALE_MS);
}
