import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
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

export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(prototypeReducer, undefined, createInitialPrototypeState);
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
