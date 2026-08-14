import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { resolveAcademicWeekRange } from "./academicWeek";

describe("academic week mapping", () => {
  it("maps a source-backed week number to its seven-day range", () => {
    const event = academicEventFixture({ scheduledWeek: 8, weekOneStartDate: "2026-06-01" });
    expect(resolveAcademicWeekRange(event, { semesterWeekOneStartDate: null })).toEqual({
      startDate: "2026-07-20", endDate: "2026-07-26", source: "academic-event",
    });
  });

  it("uses the stored semester start only when the event has no source-backed mapping", () => {
    const event = academicEventFixture({ scheduledWeek: 2, weekOneStartDate: null });
    expect(resolveAcademicWeekRange(event, { semesterWeekOneStartDate: "2026-08-31" })?.startDate).toBe("2026-09-07");
    expect(resolveAcademicWeekRange(event, { semesterWeekOneStartDate: null })).toBeNull();
  });
});
