import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../../test/academicEventFixture";
import { emptyPlanningProfile } from "../../store/planningStorage";
import { selectNextPlanningQuestion } from "./AiMateProvider";

describe("planning personalization question priority", () => {
  it("asks for the semester week-one start before confidence questions", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)).toMatchObject({
      id: "semester-week-one-start", kind: "semester-start", chips: [],
    });
  });

  it("does not ask again when uploaded evidence already maps week one", () => {
    const event = academicEventFixture({
      itemType: "exam", date: null, scheduledWeek: 8, weekOneStartDate: "2026-08-31", reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)?.kind).toBe("confidence");
  });
});
