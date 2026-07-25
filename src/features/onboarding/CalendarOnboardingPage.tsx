import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePrototypeStore } from "../../store/PrototypeStore";
import {
  connectMockCalendar,
  type CalendarMockScenario,
} from "./mockCalendarConnector";
import "./onboarding.css";

export function CalendarOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch } = usePrototypeStore();
  const attemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const step = state.onboarding.calendarStep;
  const scenario: CalendarMockScenario =
    searchParams.get("calendarMock") === "fail-once" ? "fail-once" : "success";

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  async function connect() {
    if (step === "connecting") return;
    attemptRef.current += 1;
    dispatch({ type: "calendar/connectionStarted", payload: {} });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await connectMockCalendar({
        scenario,
        attempt: attemptRef.current,
        signal: controller.signal,
      });
      dispatch({ type: "calendar/connectionSucceeded", payload: result });
      navigate("/today", { replace: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "calendar/connectionFailed", payload: {} });
    }
  }

  function skip() {
    abortRef.current?.abort();
    dispatch({ type: "calendar/onboardingSkipped", payload: {} });
    navigate("/today", { replace: true });
  }

  return (
    <main className="calendar-onboarding" aria-labelledby="calendar-onboarding-title">
      <header>
        <h1 id="calendar-onboarding-title">Google Calendar 연결</h1>
        <p>
          개인 일정과 수업 시간을
          <br />
          함께 반영해요
        </p>
      </header>
      <section className="calendar-onboarding-card" aria-label="Google Calendar 연결 안내">
        <div className="calendar-illustration" aria-hidden="true">
          <span className="google-calendar-mark">31</span>
          <span className="calendar-link-line" />
          <span className="catchup-calendar-mark" />
        </div>
        <ul>
          <li>개인 일정과 수업 시간을 같은 계획에 반영</li>
          <li>충돌 없는 일정으로 하루 만들기</li>
          <li>언제든 연결 해제 가능</li>
        </ul>
        {step === "error" ? (
          <p className="calendar-error" role="alert">
            Calendar 연결에 실패했어요. 다시 시도해주세요.
          </p>
        ) : (
          <p className="calendar-status" role="status" aria-live="polite">
            {step === "connecting" ? "Calendar를 연결하고 있어요." : ""}
          </p>
        )}
        <button
          className="calendar-connect-button"
          type="button"
          disabled={step === "connecting"}
          onClick={connect}
        >
          {step === "connecting" ? "연결 중..." : step === "error" ? "다시 시도" : "캘린더 연결하기"}
        </button>
        <button
          className="calendar-skip-button"
          type="button"
          disabled={step === "connecting"}
          onClick={skip}
        >
          나중에 할게요
        </button>
      </section>
    </main>
  );
}
