import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import {
  academicEventConfirmationRequiredInfoLabels,
  assessAcademicEventConfirmation,
} from "./academicEventStatus";

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
    expect(assessAcademicEventConfirmation(academicEventFixture({ submissionMethod: null }))).toEqual({
      dateCertainty: "exact-date",
      confirmationStatus: "confirmed",
      confirmationIssues: [],
    });
  });

  it.each([
    ["assignment", { requirements: "PDF report", workload: "5 pages" }],
    ["team-project", { requirements: "team presentation", workload: "10 slides" }],
    ["presentation", { requirements: "10-minute presentation" }],
    ["exam", { examScope: "weeks 1-7" }],
    ["quiz", { examScope: "chapter 4" }],
    ["other", {}],
  ] as const)("confirms %s with exactly its type-specific required information", (itemType, fields) => {
    expect(assessAcademicEventConfirmation(academicEventFixture({
      itemType,
      requirements: null,
      workload: null,
      submissionMethod: null,
      examScope: null,
      ...fields,
    }))).toMatchObject({ confirmationStatus: "confirmed", confirmationIssues: [] });
  });

  it.each([
    ["assignment", { requirements: null, workload: "5 pages" }],
    ["assignment", { requirements: "PDF report", workload: null }],
    ["team-project", { requirements: "presentation", workload: "   " }],
    ["presentation", { requirements: "   ", workload: "10 minutes" }],
  ] as const)("keeps %s unconfirmed when one required detail is missing", (itemType, fields) => {
    expect(assessAcademicEventConfirmation(academicEventFixture({
      itemType,
      submissionMethod: "LMS inbox",
      ...fields,
    }))).toMatchObject({ confirmationStatus: "unconfirmed", confirmationIssues: ["missing-details"] });
  });

  it("does not use title, course, or optional extracted details as confirmation requirements", () => {
    expect(assessAcademicEventConfirmation(academicEventFixture({
      title: "",
      courseName: "",
      submissionMethod: null,
      estimatedDurationMinutes: null,
      deliverableComplexity: null,
    }))).toMatchObject({ confirmationStatus: "confirmed", confirmationIssues: [] });
  });

  it.each([
    ["assignment", "\uC815\uD655\uD55C \uB0A0\uC9DC, \uC694\uAD6C\uC0AC\uD56D, \uBD84\uB7C9"],
    ["team-project", "\uC815\uD655\uD55C \uB0A0\uC9DC, \uC694\uAD6C\uC0AC\uD56D, \uBD84\uB7C9"],
    ["presentation", "\uC815\uD655\uD55C \uB0A0\uC9DC, \uC694\uAD6C\uC0AC\uD56D"],
    ["exam", "\uC815\uD655\uD55C \uB0A0\uC9DC, \uC2DC\uD5D8 \uBC94\uC704"],
    ["quiz", "\uC815\uD655\uD55C \uB0A0\uC9DC, \uC2DC\uD5D8 \uBC94\uC704"],
    ["other", "\uC815\uD655\uD55C \uB0A0\uC9DC"],
  ] as const)("keeps the %s guidance synchronized with its policy", (itemType, label) => {
    expect(academicEventConfirmationRequiredInfoLabels[itemType]).toBe(label);
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
