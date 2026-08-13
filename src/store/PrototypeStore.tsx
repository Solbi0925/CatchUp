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
import { readAcademicEvents, writeAcademicEvents } from "./academicEventsStorage";
import { readPlanningState, writePlanningState } from "./planningStorage";

interface PrototypeStoreValue {
  state: PrototypeState;
  dispatch: Dispatch<PrototypeAction>;
}

const PrototypeStoreContext = createContext<PrototypeStoreValue | null>(null);

function createStoreInitialState() {
  const state = createInitialPrototypeState();
  const confirmedItems = readAcademicEvents();
  const planning = readPlanningState();
  const stateWithConfirmedItems = {
    ...state,
    extractedItemsById: Object.fromEntries(confirmedItems.map((item) => [item.id, item])),
    weeklyPlansById: Object.fromEntries(planning.weeklyPlans.map((plan) => [plan.id, plan])),
    todosById: Object.fromEntries(planning.todos.map((todo) => [todo.id, todo])),
    todoIdsByWeeklyPlanId: planning.todoIdsByWeeklyPlanId,
    planningProfile: planning.profile,
    adjustmentUsageByDate: planning.adjustmentUsageByDate,
    planAdjustmentsById: Object.fromEntries(planning.planAdjustments.map((adjustment) => [adjustment.id, adjustment])),
    pendingPlanUpdate: planning.pendingPlanUpdate,
  };
  const session = readOnboardingSession();
  if (!session) return stateWithConfirmedItems;
  return {
    ...stateWithConfirmedItems,
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
  useEffect(() => {
    writeAcademicEvents(Object.values(state.extractedItemsById));
  }, [state.extractedItemsById]);
  useEffect(() => {
    writePlanningState({
      weeklyPlans: Object.values(state.weeklyPlansById),
      todos: Object.values(state.todosById),
      todoIdsByWeeklyPlanId: state.todoIdsByWeeklyPlanId,
      profile: state.planningProfile,
      adjustmentUsageByDate: state.adjustmentUsageByDate,
      planAdjustments: Object.values(state.planAdjustmentsById),
      pendingPlanUpdate: state.pendingPlanUpdate,
    });
  }, [state.adjustmentUsageByDate, state.pendingPlanUpdate, state.planAdjustmentsById, state.planningProfile, state.todoIdsByWeeklyPlanId, state.todosById, state.weeklyPlansById]);
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
