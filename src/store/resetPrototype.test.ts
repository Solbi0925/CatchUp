import { describe, expect, it, vi } from "vitest";
import { resetCatchUpPrototype } from "./resetPrototype";

function memoryStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("prototype reset", () => {
  it("removes every CatchUp persisted value and reloads from the initial route", () => {
    const local = memoryStorage({
      "catchup.academic-events.v2": "events",
      "catchup.planning.v1": "plan",
      "another-service": "keep",
    });
    const session = memoryStorage({
      "catchup:prototype:onboarding:v1": "onboarding",
      "another-session": "keep",
    });
    const reload = vi.fn();

    resetCatchUpPrototype({ localStorage: local, sessionStorage: session, reload });

    expect(local.getItem("catchup.academic-events.v2")).toBeNull();
    expect(local.getItem("catchup.planning.v1")).toBeNull();
    expect(session.getItem("catchup:prototype:onboarding:v1")).toBeNull();
    expect(local.getItem("another-service")).toBe("keep");
    expect(session.getItem("another-session")).toBe("keep");
    expect(reload).toHaveBeenCalledOnce();
  });
});
