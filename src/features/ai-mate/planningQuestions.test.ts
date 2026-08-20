import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../../test/academicEventFixture";
import { emptyPlanningProfile } from "../../store/planningStorage";
import { parseMaxDailyStudyMinutes, selectGenerationPlanningQuestion, selectNextPlanningQuestion } from "./AiMateProvider";

describe("planning personalization question priority", () => {
  it("asks for and then reuses the user's realistic maximum daily study time", () => {
    const question = selectGenerationPlanningQuestion([], emptyPlanningProfile);
    expect(question?.kind).toBe("max-daily-study");
    expect(question?.prompt).toBe("하루에 최대 몇 시간 정도까지 공부하거나 과제를 할 수 있나요?");
    expect(question?.chips.map((chip) => chip.label)).toEqual(["1시간 이내", "2-4시간", "4-6시간", "6-8시간", "그 이상"]);
    expect(selectGenerationPlanningQuestion([], { ...emptyPlanningProfile, maxDailyStudyMinutes: 240 })).toBeNull();
  });

  it.each([
    ["1시간 이내", 60],
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

  it("asks only for the shared semester mapping date, not each event's missing date", () => {
    const event = academicEventFixture({
      date: null, scheduledWeek: 8, weekOneStartDate: null, reviewStatus: "confirmed",
      confirmationStatus: "unconfirmed",
    });
    expect(selectGenerationPlanningQuestion([event], {
      ...emptyPlanningProfile,
      maxDailyStudyMinutes: 240,
    })?.kind).toBe("semester-start");
    expect(selectGenerationPlanningQuestion([event], {
      ...emptyPlanningProfile,
      semesterWeekOneStartDate: "2026-08-31",
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
