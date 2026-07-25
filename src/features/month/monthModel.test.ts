import { describe, expect, it } from "vitest";
import { buildMonthGrid, shiftMonth } from "./monthModel";

describe("monthModel", () => {
  it("builds the real Sunday-first July 2026 grid", () => {
    const grid = buildMonthGrid("2026-07");
    expect(grid).toHaveLength(35);
    expect(grid[0]).toEqual({ date: "2026-06-28", isCurrentMonth: false });
    expect(grid.at(-1)).toEqual({ date: "2026-08-01", isCurrentMonth: false });
  });

  it("supports four and six week months", () => {
    expect(buildMonthGrid("2026-02")).toHaveLength(28);
    expect(buildMonthGrid("2026-08")).toHaveLength(42);
  });

  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
