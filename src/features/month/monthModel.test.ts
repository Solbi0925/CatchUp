import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  formatDateKey,
  formatMonthKey,
  parseCanonicalDate,
  parseCanonicalMonth,
  resolveMonthQuery,
  shiftMonth,
} from "./monthModel";

describe("Month UTC date model", () => {
  it("parses only real canonical UTC month and date keys", () => {
    expect(parseCanonicalMonth("2026-07")).toEqual({ year: 2026, month: 7 });
    expect(parseCanonicalMonth("2026-7")).toBeNull();
    expect(parseCanonicalMonth("2026-13")).toBeNull();

    expect(parseCanonicalDate("2000-02-29")).toEqual({
      year: 2000,
      month: 2,
      day: 29,
    });
    expect(parseCanonicalDate("1900-02-29")).toBeNull();
    expect(parseCanonicalDate("2100-02-29")).toBeNull();
    expect(parseCanonicalDate("2026-02-29")).toBeNull();
    expect(parseCanonicalDate("2026-07-3")).toBeNull();
  });

  it("formats UTC date parts into canonical keys", () => {
    expect(formatMonthKey({ year: 2026, month: 7 })).toBe("2026-07");
    expect(formatDateKey({ year: 2026, month: 7, day: 3 })).toBe("2026-07-03");
  });

  it("rejects date parts that cannot form canonical keys", () => {
    expect(formatMonthKey({ year: 10_000, month: 1 })).toBeNull();
    expect(formatMonthKey({ year: 2026, month: 13 })).toBeNull();
    expect(formatMonthKey({ year: 2026.5, month: 7 })).toBeNull();
    expect(formatDateKey({ year: 2026, month: 2, day: 29 })).toBeNull();
    expect(formatDateKey({ year: 2000, month: 2, day: 29 })).toBe("2000-02-29");
    expect(formatDateKey({ year: 2026, month: 7, day: 32 })).toBeNull();
  });

  it("moves months across January and December boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("rejects month navigation outside the supported canonical year range", () => {
    expect(shiftMonth("9999-12", 1)).toBe("9999-12");
    expect(shiftMonth("0000-01", -1)).toBe("0000-01");
  });

  it("builds a Sunday-first grid through the final Saturday", () => {
    const july = buildMonthGrid("2026-07");

    expect(july).toHaveLength(35);
    expect(july[0]).toEqual({ date: "2026-06-28", isCurrentMonth: false });
    expect(july[3]).toEqual({ date: "2026-07-01", isCurrentMonth: true });
    expect(july.at(-1)).toEqual({ date: "2026-08-01", isCurrentMonth: false });
    expect(july.filter((cell) => cell.isCurrentMonth)).toHaveLength(31);
  });

  it("uses 28 cells for a February that starts Sunday and ends Saturday", () => {
    const february = buildMonthGrid("2026-02");

    expect(february).toHaveLength(28);
    expect(february[0]?.date).toBe("2026-02-01");
    expect(february.at(-1)?.date).toBe("2026-02-28");
  });

  it("uses six weeks when a month needs dates after its final Saturday", () => {
    const august = buildMonthGrid("2026-08");

    expect(august).toHaveLength(42);
    expect(august[0]?.date).toBe("2026-07-26");
    expect(august.at(-1)?.date).toBe("2026-09-05");
  });

  it("rejects boundary months that cannot form a complete canonical grid", () => {
    expect(buildMonthGrid("0000-01")).toEqual([]);
    expect(buildMonthGrid("9999-12")).toEqual([]);
  });

  it("resolves invalid query values to the canonical demo today month and date", () => {
    expect(resolveMonthQuery(new URLSearchParams("month=2026-7&date=2026-07-40"), "2026-07-20")).toEqual({
      month: "2026-07",
      date: "2026-07-20",
    });
    expect(resolveMonthQuery(new URLSearchParams("month=2026-08&date=2026-07-31"), "2026-07-20")).toEqual({
      month: "2026-08",
      date: "2026-07-31",
    });
    expect(resolveMonthQuery(new URLSearchParams("month=0000-01&date=0000-01-01"), "2026-07-20")).toEqual({
      month: "2026-07",
      date: "2026-07-20",
    });
  });
});
