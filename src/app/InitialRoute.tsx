import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { usePrototypeStore } from "../store/PrototypeStore";
import { clearOnboardingSession } from "../store/onboardingSession";

export function InitialRoute() {
  const { state, dispatch } = usePrototypeStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const didReset = useRef(false);
  const resetRequested = searchParams.get("resetDemo") === "1";

  useEffect(() => {
    if (!resetRequested || didReset.current) return;
    didReset.current = true;
    clearOnboardingSession();
    dispatch({ type: "demo/reset", payload: {} });
    navigate("/onboarding/intro", { replace: true });
  }, [dispatch, navigate, resetRequested]);

  if (resetRequested && !didReset.current) return null;
  if (!state.onboarding.introSeen) {
    return <Navigate to="/onboarding/intro" replace />;
  }
  if (state.onboarding.calendarStep === "idle" || state.onboarding.calendarStep === "error") {
    return <Navigate to="/onboarding/calendar" replace />;
  }
  return <Navigate to="/today" replace />;
}
