import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useGoogleCalendarSync } from "./GoogleCalendarSyncProvider";
import "./googleCalendarSync.css";

export function GoogleCalendarSyncStatus() {
  const { phase, status, error, ensureFresh, disconnect } = useGoogleCalendarSync();
  useEffect(() => { if (import.meta.env.MODE !== "test") void ensureFresh(); }, [ensureFresh]);
  const connected = phase === "connected" || phase === "syncing" || status?.connected;
  return (
    <aside className={`google-sync-status ${phase === "error" ? "is-error" : ""}`} aria-label="Google Calendar 동기화 상태">
      <div>
        <strong>{connected ? "Google Calendar 연결됨" : "Google Calendar 연결 안 됨"}</strong>
        <span aria-live="polite">
          {phase === "syncing" ? "동기화 중" : phase === "checking" ? "연결 확인 중" : phase === "error" ? error ?? "동기화 실패" : status?.lastSyncAt ? `마지막 동기화 ${new Date(status.lastSyncAt).toLocaleString("ko-KR")}` : connected ? "첫 동기화 대기 중" : "개인 일정을 연결할 수 있어요."}
        </span>
      </div>
      <div className="google-sync-actions">
        {connected ? <>
          <button type="button" disabled={phase === "syncing"} onClick={() => void ensureFresh(true)}>{phase === "error" ? "다시 시도" : "지금 동기화"}</button>
          <button type="button" onClick={() => void disconnect()}>연결 해제</button>
        </> : <Link to="/onboarding/calendar">연결하기</Link>}
      </div>
    </aside>
  );
}
