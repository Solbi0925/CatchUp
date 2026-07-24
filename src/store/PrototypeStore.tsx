import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { demoCalendarEvents, demoCatchUpCalendarEvents } from "../mocks/templates";
import { readOnboardingSession, writeOnboardingSession } from "./onboardingSession";
import {
  createInitialPrototypeState,
  type PrototypeAction,
  type PrototypeState,
  prototypeReducer,
} from "./prototypeReducer";

interface PrototypeStoreValue {
  state: PrototypeState;
  dispatch: Dispatch<PrototypeAction>;
}

const PrototypeStoreContext = createContext<PrototypeStoreValue | null>(null);

function createStoreInitialState() {
  const state = createInitialPrototypeState();
  const session = readOnboardingSession();
  if (!session) return state;
  return {
    ...state,
    user: {
      ...state.user,
      calendarConnectionStatus: session.calendarConnected ? "connected" : "disconnected",
    } as PrototypeState["user"],
    onboarding: {
      introSeen: session.introSeen,
      calendarStep: session.calendarStep,
    },
    calendarEventsById: session.calendarConnected
      ? Object.fromEntries(
          [...demoCalendarEvents, ...demoCatchUpCalendarEvents].map((event) => [
            event.id,
            { ...event },
          ]),
        )
      : {},
  };
}

export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(prototypeReducer, undefined, createStoreInitialState);
  useEffect(() => {
    writeOnboardingSession(state);
  }, [state.onboarding, state.user.calendarConnectionStatus]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <PrototypeStoreContext.Provider value={value}>{children}</PrototypeStoreContext.Provider>
  );
}

export function usePrototypeStore() {
  const value = useContext(PrototypeStoreContext);
  if (!value) throw new Error("usePrototypeStore must be used inside PrototypeStoreProvider");
  return value;
}
