import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../../test/academicEventFixture";
import { emptyPlanningProfile } from "../../store/planningStorage";
import { buildMonthSchedules } from "./monthSelectors";

describe("Month academic schedules", () => {
  it("projects one week-only event across exactly seven days without persisting clones", () => {
    const event = academicEventFixture({
      id: "exam", title: "인공지능소개 중간고사", itemType: "exam", date: null,
      scheduledWeek: 8, reviewStatus: "confirmed", confirmationStatus: "unconfirmed",
    });
    const schedules = buildMonthSchedules([event], [], { ...emptyPlanningProfile, semesterWeekOneStartDate: "2026-06-01" });
    expect(schedules).toHaveLength(7);
    expect(schedules.map((item) => item.date)).toEqual([
      "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26",
    ]);
    expect(new Set(schedules.map((item) => item.extractedItemId))).toEqual(new Set(["exam"]));
    expect(schedules.every((item) => item.title === "인공지능소개 중간고사 주" && item.isProvisional)).toBe(true);
  });

  it("does not place a week-only event without a trusted date mapping", () => {
    const event = academicEventFixture({ date: null, scheduledWeek: 8, reviewStatus: "confirmed", confirmationStatus: "unconfirmed" });
    expect(buildMonthSchedules([event], [], emptyPlanningProfile)).toEqual([]);
  });

  it("keeps an exact-date event on only that date", () => {
    const event = academicEventFixture({ date: "2026-08-28", reviewStatus: "confirmed" });
    const schedules = buildMonthSchedules([event], [], emptyPlanningProfile);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ date: "2026-08-28", isProvisional: false, temporalPrecision: "exact-date" });
  });
});
