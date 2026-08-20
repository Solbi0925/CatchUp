import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { useGoogleCalendarSync } from "../calendar/GoogleCalendarSyncProvider";
import "./onboarding.css";
import googleCalendarIcon from "../../assets/google-calendar-blue.png";

export function CalendarOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch } = usePrototypeStore();
  const { phase, status, error, connectUrl, ensureFresh, disconnect } = useGoogleCalendarSync();
  const oauthResult = searchParams.get("googleCalendar");
  const connecting = phase === "checking" || phase === "syncing";
  const notConfigured = status?.configured === false;

  useEffect(() => {
    if (oauthResult === "connected") void ensureFresh(true);
  }, [ensureFresh, oauthResult]);

  useEffect(() => {
    if (oauthResult === "connected" && phase === "connected") navigate("/today", { replace: true });
  }, [navigate, oauthResult, phase]);

  function skip() {
    dispatch({ type: "calendar/onboardingSkipped", payload: {} });
    navigate("/today", { replace: true });
  }

  return (
    <main className="calendar-onboarding" aria-labelledby="calendar-onboarding-title">
      <header>
        <h1 id="calendar-onboarding-title">Google Calendar 연결</h1>
      </header>
      <section className="calendar-onboarding-card" aria-label="Google Calendar 연결 안내">
        <div className="calendar-illustration">
          <span
            className="google-calendar-frame"
            data-testid="google-calendar-icon-frame"
          >
            <img className="google-calendar-mark" src={googleCalendarIcon} alt="Google Calendar" />
          </span>
          <span
            className="calendar-link-line"
            data-testid="calendar-connector"
            aria-hidden="true"
          />
          <span className="catchup-calendar-mark" aria-hidden="true" />
        </div>
        <ul>
          <li>개인 일정과 수업 시간을 같은 계획에 반영</li>
          <li>충돌 없는 일정으로 하루 만들기</li>
          <li>언제든 연결 해제 가능</li>
        </ul>
        <p className="calendar-help">Google Calendar에 시작·종료 시간을 정확히 입력할수록 실제 학습 가능 시간을 더 정확하게 계산할 수 있어요. 종일 일정은 해당 날짜 전체 일정으로 반영됩니다.</p>
        {phase === "error" || oauthResult === "denied" || oauthResult === "error" || notConfigured ? (
          <p className="calendar-error" role="alert">
            {oauthResult === "denied" ? "Google Calendar 연결이 승인되지 않았어요." : notConfigured ? "Google Calendar 연결 환경변수를 먼저 설정해주세요." : error ?? "Google Calendar 연결을 완료하지 못했어요. 설정을 확인하고 다시 시도해주세요."}
          </p>
        ) : (
          <p className="calendar-status" role="status" aria-live="polite">
            {phase === "syncing" ? "일정을 처음 동기화하고 있어요." : phase === "checking" ? "연결 상태를 확인하고 있어요." : phase === "connected" ? `연결됨${status?.lastSyncAt ? ` · 마지막 동기화 ${new Date(status.lastSyncAt).toLocaleString("ko-KR")}` : ""}` : "Google Calendar 연결 안 됨"}
          </p>
        )}
        {phase === "connected" ? <>
          <button className="calendar-connect-button" type="button" onClick={() => void ensureFresh(true)}>지금 동기화</button>
          <button className="calendar-skip-button" type="button" onClick={() => void disconnect()}>연결 해제</button>
          <button className="calendar-skip-button" type="button" onClick={() => navigate("/today", { replace: true })}>Today로 이동</button>
        </> : <a
          className={`calendar-connect-button${connecting || notConfigured ? " is-disabled" : ""}`}
          aria-disabled={connecting || notConfigured}
          href={connecting || notConfigured ? undefined : connectUrl(`${window.location.origin}/onboarding/calendar`)}
          onClick={() => dispatch({ type: "calendar/connectionStarted", payload: {} })}
        >
          {connecting ? "연결 중..." : notConfigured ? "연결 설정 필요" : phase === "error" ? "다시 시도" : "캘린더 연결하기"}
        </a>}
        {phase !== "connected" && <button
          className="calendar-skip-button"
          type="button"
          disabled={connecting}
          onClick={skip}
        >
          나중에 할게요
        </button>}
      </section>
    </main>
  );
}
