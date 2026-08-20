import type {
  AcademicEventConfirmationIssue,
  AcademicEventConfirmationStatus,
  AcademicEventDateCertainty,
  ExtractedItem,
} from "./types";

type AssessableAcademicEvent = Pick<
  ExtractedItem,
  | "itemType"
  | "date"
  | "scheduledWeek"
  | "workload"
  | "requirements"
  | "examScope"
  | "classMeetingTimes"
>;

const hasText = (value: string | null) => Boolean(value?.trim());

export interface AcademicEventConfirmationAssessment {
  dateCertainty: AcademicEventDateCertainty;
  confirmationStatus: AcademicEventConfirmationStatus;
  confirmationIssues: AcademicEventConfirmationIssue[];
}

export function assessAcademicEventConfirmation(
  event: AssessableAcademicEvent,
): AcademicEventConfirmationAssessment {
  const confirmationIssues: AcademicEventConfirmationIssue[] = [];
  const dateCertainty: AcademicEventDateCertainty = event.date
    ? "exact-date"
    : event.scheduledWeek
      ? "academic-week"
      : "unknown";
  // Timetable rows have their own schedulability rule and are not part of the
  // type-specific AcademicEvent confirmation policy below.
  if (event.itemType === "class-schedule") {
    if (!event.date && event.classMeetingTimes.length === 0) {
      confirmationIssues.push("missing-class-time");
    }
  } else {
    if (!event.date) confirmationIssues.push("missing-date");

    if (
      (event.itemType === "assignment" || event.itemType === "team-project") &&
      (!hasText(event.requirements) || !hasText(event.workload))
    ) {
      confirmationIssues.push("missing-details");
    }
    if (event.itemType === "presentation" && !hasText(event.requirements)) {
      confirmationIssues.push("missing-details");
    }
    if ((event.itemType === "exam" || event.itemType === "quiz") && !hasText(event.examScope)) {
      confirmationIssues.push("missing-exam-scope");
    }
  }

  return {
    dateCertainty,
    confirmationStatus: confirmationIssues.length === 0 ? "confirmed" : "unconfirmed",
    confirmationIssues,
  };
}

export const academicEventConfirmationRequiredInfoLabels: Record<
  ExtractedItem["itemType"],
  string
> = {
  assignment: "정확한 날짜, 요구사항, 분량",
  exam: "정확한 날짜, 시험 범위",
  "team-project": "정확한 날짜, 요구사항, 분량",
  presentation: "정확한 날짜, 요구사항",
  quiz: "정확한 날짜, 시험 범위",
  "class-schedule": "수업 요일과 시작·종료 시간",
  other: "정확한 날짜",
};
