import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../../test/academicEventFixture";
import { emptyPlanningProfile } from "../../store/planningStorage";
import { parseMaxDailyStudyMinutes, selectGenerationPlanningQuestion, selectNextPlanningQuestion } from "./AiMateProvider";

describe("planning personalization question priority", () => {
  it("asks for and then reuses the user's realistic maximum daily study time", () => {
    const question = selectGenerationPlanningQuestion([], emptyPlanningProfile);
    expect(question?.kind).toBe("max-daily-study");
    expect(question?.chips.map((chip) => chip.label)).toEqual(["2-4시간", "4-6시간", "6-8시간", "그 이상"]);
    expect(selectGenerationPlanningQuestion([], { ...emptyPlanningProfile, maxDailyStudyMinutes: 240 })).toBeNull();
  });

  it.each([
    ["2-4시간", 180],
    ["4~6시간", 300],
    ["6–8시간", 420],
    ["8시간 이상", 540],
    ["최대 6시간", 360],
    ["150분", 150],
  ])("converts %s to a deterministic daily study limit", (answer, expected) => {
    expect(parseMaxDailyStudyMinutes(answer)).toBe(expected);
  });
  it("does not ask planning questions for an unconfirmed week-only event", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed", estimatedDurationMinutes: null,
    });
    expect(selectNextPlanningQuestion([event], emptyPlanningProfile)).toBeNull();
  });

  it("does not ask for missing dates while generating a plan", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed",
    });
    expect(selectGenerationPlanningQuestion([event], {
      ...emptyPlanningProfile,
      maxDailyStudyMinutes: 240,
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
