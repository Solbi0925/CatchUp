import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../../test/academicEventFixture";
import { emptyPlanningProfile } from "../../store/planningStorage";
import { selectNextPlanningQuestion } from "./AiMateProvider";

describe("planning personalization question priority", () => {
  it("does not ask planning questions for an unconfirmed week-only event", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)).toBeNull();
  });

  it("asks only event-specific questions for a confirmed event during update", () => {
    const event = academicEventFixture({
      itemType: "exam", date: "2026-09-30", scheduledWeek: 8, weekOneStartDate: "2026-08-31", reviewStatus: "confirmed",
      confirmationStatus: "confirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)?.kind).toBe("confidence");
  });
});
