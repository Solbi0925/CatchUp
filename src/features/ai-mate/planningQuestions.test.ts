import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../../test/academicEventFixture";
import { emptyPlanningProfile } from "../../store/planningStorage";
import { selectNextPlanningQuestion, selectWeekMappingQuestion } from "./AiMateProvider";

describe("planning personalization question priority", () => {
  it("does not ask planning questions for an unconfirmed week-only event", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)).toBeNull();
  });

  it("asks only for the semester start needed to place a week-only event on Today and Month", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed",
    });
    expect(selectWeekMappingQuestion([event], emptyPlanningProfile)?.kind).toBe("semester-start");
    expect(selectWeekMappingQuestion([event], {
      ...emptyPlanningProfile,
      semesterWeekOneStartDate: "2026-08-31",
    })).toBeNull();
  });

  it("asks only event-specific questions for a confirmed event during update", () => {
    const event = academicEventFixture({
      itemType: "exam", date: "2026-09-30", scheduledWeek: 8, weekOneStartDate: "2026-08-31", reviewStatus: "confirmed",
      confirmationStatus: "confirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)?.kind).toBe("confidence");
  });
});
