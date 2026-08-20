import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePrototypeStore } from "../../store/PrototypeStore";
import {
  isGoogleCalendarSyncStale,
  LocalBridgeGoogleCalendarRepository,
  mergeGoogleCalendarSync,
  type CalendarEventRepository,
  type GoogleCalendarStatus,
} from "./googleCalendarRepository";

export type GoogleCalendarSyncPhase = "idle" | "checking" | "syncing" | "connected" | "disconnected" | "error";

interface GoogleCalendarSyncContextValue {
  phase: GoogleCalendarSyncPhase;
  status: GoogleCalendarStatus | null;
  error: string | null;
  connectUrl: (returnTo?: string) => string;
  ensureFresh: (force?: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
}

const GoogleCalendarSyncContext = createContext<GoogleCalendarSyncContextValue | null>(null);
const defaultRepository = new LocalBridgeGoogleCalendarRepository();

export function GoogleCalendarSyncProvider({
  children,
  repository = defaultRepository,
  autoInitialize = import.meta.env.MODE !== "test",
}: {
  children: ReactNode;
  repository?: CalendarEventRepository;
  autoInitialize?: boolean;
}) {
  const { state, dispatch } = usePrototypeStore();
  const [phase, setPhase] = useState<GoogleCalendarSyncPhase>("idle");
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  const eventsRef = useRef(state.calendarEventsById);
  const inFlight = useRef<Promise<void> | null>(null);
  statusRef.current = status;
  eventsRef.current = state.calendarEventsById;

  const syncNow = useCallback(async () => {
    setPhase("syncing");
    setError(null);
    const payload = await repository.sync();
    const existing = Object.values(eventsRef.current);
    const merged = mergeGoogleCalendarSync(existing, payload, state.user.id);
    const beforeGoogle = existing.filter((event) => event.source === "google-calendar").sort((a, b) => a.id.localeCompare(b.id));
    const afterGoogle = merged.filter((event) => event.source === "google-calendar").sort((a, b) => a.id.localeCompare(b.id));
    const changed = JSON.stringify(beforeGoogle) !== JSON.stringify(afterGoogle);
    dispatch({ type: "calendar/googleSyncApplied", payload: { events: merged, changed } });
    const nextStatus = { ...(statusRef.current ?? {
      configured: true, connected: true, syncRangeStart: payload.syncRangeStart, syncRangeEnd: payload.syncRangeEnd,
      staleAfterMs: 5 * 60 * 1000, errorCode: null,
    }), connected: true, lastSyncAt: payload.lastSyncAt, syncRangeStart: payload.syncRangeStart, syncRangeEnd: payload.syncRangeEnd, errorCode: null };
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setPhase("connected");
  }, [dispatch, repository, state.user.id]);

  const ensureFresh = useCallback(async (force = false) => {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      try {
        let current = statusRef.current;
        if (!current) {
          setPhase("checking");
          current = await repository.status();
          statusRef.current = current;
          setStatus(current);
          dispatch({ type: "calendar/statusLoaded", payload: { connected: current.connected } });
        }
        if (!current.connected) {
          setPhase("disconnected");
          return;
        }
        if (force || isGoogleCalendarSyncStale(current)) await syncNow();
        else setPhase("connected");
      } catch (caught) {
        setPhase("error");
        setError(caught instanceof Error ? caught.message : "Google Calendar 동기화에 실패했어요.");
      }
    })().finally(() => { inFlight.current = null; });
    inFlight.current = task;
    return task;
  }, [dispatch, repository, syncNow]);

  const disconnect = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    try {
      await repository.disconnect();
      statusRef.current = null;
      setStatus(null);
      setError(null);
      setPhase("disconnected");
      dispatch({ type: "calendar/disconnected", payload: {} });
    } catch (caught) {
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Google Calendar 연결 해제에 실패했어요.");
    }
  }, [dispatch, repository]);

  useEffect(() => {
    if (autoInitialize) void ensureFresh();
  }, [autoInitialize, ensureFresh]);

  const value = useMemo<GoogleCalendarSyncContextValue>(() => ({
    phase, status, error,
    connectUrl: (returnTo = `${window.location.origin}/onboarding/calendar`) => repository.connectUrl(returnTo),
    ensureFresh,
    disconnect,
  }), [disconnect, ensureFresh, error, phase, repository, status]);

  return <GoogleCalendarSyncContext.Provider value={value}>{children}</GoogleCalendarSyncContext.Provider>;
}

export function useGoogleCalendarSync() {
  const value = useContext(GoogleCalendarSyncContext);
  if (!value) throw new Error("useGoogleCalendarSync must be used inside GoogleCalendarSyncProvider");
  return value;
}
