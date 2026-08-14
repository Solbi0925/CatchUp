import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { assessAcademicEventConfirmation } from "./academicEventStatus";

describe("assessAcademicEventConfirmation", () => {
  it("keeps a syllabus-only assignment unconfirmed without a date or details", () => {
    expect(assessAcademicEventConfirmation(academicEventFixture({
      date: null,
      requirements: null,
      workload: null,
      submissionMethod: null,
    }))).toEqual({
      dateCertainty: "unknown",
      confirmationStatus: "unconfirmed",
      confirmationIssues: ["missing-date", "missing-details"],
    });
  });

  it("confirms an assignment after source-backed timing and details are supplied", () => {
    expect(assessAcademicEventConfirmation(academicEventFixture())).toEqual({
      dateCertainty: "exact-date",
      confirmationStatus: "confirmed",
      confirmationIssues: [],
    });
  });

  it("preserves a scheduled exam week without treating it as an exact date", () => {
    expect(assessAcademicEventConfirmation(academicEventFixture({
      itemType: "exam",
      date: null,
      scheduledWeek: 8,
      scheduledWeekLabel: "8주차",
      examScope: null,
    }))).toEqual({
      dateCertainty: "academic-week",
      confirmationStatus: "unconfirmed",
      confirmationIssues: ["missing-date", "missing-exam-scope"],
    });
  });

  it("confirms a recurring timetable class from its weekday and time", () => {
    expect(assessAcademicEventConfirmation(academicEventFixture({
      itemType: "class-schedule",
      date: null,
      time: null,
      classMeetingTimes: [{
        id: "meeting-1",
        weekday: 1,
        startTime: "10:30",
        endTime: "11:45",
        location: "401-930",
      }],
    }))).toEqual({ dateCertainty: "unknown", confirmationStatus: "confirmed", confirmationIssues: [] });
  });
});
