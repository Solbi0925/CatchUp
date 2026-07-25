import type { PrototypeState } from "./prototypeReducer";

export const ONBOARDING_SESSION_KEY = "catchup:prototype:onboarding:v1";

interface OnboardingSessionSnapshot {
  version: 1;
  introSeen: boolean;
  calendarStep: PrototypeState["onboarding"]["calendarStep"];
  calendarConnected: boolean;
}

export function readOnboardingSession(): OnboardingSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingSessionSnapshot>;
    if (
      parsed.version !== 1 ||
      typeof parsed.introSeen !== "boolean" ||
      typeof parsed.calendarConnected !== "boolean" ||
      !["idle", "connecting", "connected", "error", "skipped"].includes(
        parsed.calendarStep ?? "",
      )
    ) {
      return null;
    }
    return parsed as OnboardingSessionSnapshot;
  } catch {
    return null;
  }
}

export function writeOnboardingSession(state: PrototypeState) {
  if (typeof window === "undefined") return;
  const snapshot: OnboardingSessionSnapshot = {
    version: 1,
    introSeen: state.onboarding.introSeen,
    calendarStep:
      state.onboarding.calendarStep === "connecting" ? "idle" : state.onboarding.calendarStep,
    calendarConnected: state.user.calendarConnectionStatus === "connected",
  };
  window.sessionStorage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(snapshot));
}

export function clearOnboardingSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ONBOARDING_SESSION_KEY);
}
