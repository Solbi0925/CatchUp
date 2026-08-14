import type {
  AcademicEventConfirmationIssue,
  AcademicEventConfirmationStatus,
  AcademicEventDateCertainty,
  ExtractedItem,
} from "./types";

type AssessableAcademicEvent = Pick<
  ExtractedItem,
  | "title"
  | "courseName"
  | "itemType"
  | "date"
  | "scheduledWeek"
  | "workload"
  | "requirements"
  | "submissionMethod"
  | "estimatedDurationMinutes"
  | "deliverableComplexity"
  | "examScope"
  | "classMeetingTimes"
>;

export interface AcademicEventConfirmationAssessment {
  dateCertainty: AcademicEventDateCertainty;
  confirmationStatus: AcademicEventConfirmationStatus;
  confirmationIssues: AcademicEventConfirmationIssue[];
}

const assignmentLikeTypes = new Set<ExtractedItem["itemType"]>([
  "assignment",
  "team-project",
  "presentation",
  "deadline",
  "submission",
]);

export function assessAcademicEventConfirmation(
  event: AssessableAcademicEvent,
): AcademicEventConfirmationAssessment {
  const confirmationIssues: AcademicEventConfirmationIssue[] = [];
  const dateCertainty: AcademicEventDateCertainty = event.date
    ? "exact-date"
    : event.scheduledWeek
      ? "academic-week"
      : "unknown";
  if (!event.title.trim()) confirmationIssues.push("missing-title");
  if (!event.courseName.trim()) confirmationIssues.push("missing-course");
  if (event.itemType === "class-schedule") {
    if (!event.date && event.classMeetingTimes.length === 0) {
      confirmationIssues.push("missing-class-time");
    }
  } else if (!event.date) {
    confirmationIssues.push("missing-date");
  }

  if (
    assignmentLikeTypes.has(event.itemType) &&
    (!event.requirements ||
      (!event.workload && !event.estimatedDurationMinutes && !event.deliverableComplexity) ||
      !event.submissionMethod)
  ) {
    confirmationIssues.push("missing-details");
  }
  if ((event.itemType === "exam" || event.itemType === "quiz") && !event.examScope) {
    confirmationIssues.push("missing-exam-scope");
  }

  return {
    dateCertainty,
    confirmationStatus: confirmationIssues.length === 0 ? "confirmed" : "unconfirmed",
    confirmationIssues,
  };
}

export const academicEventConfirmationIssueLabels: Record<
  AcademicEventConfirmationIssue,
  string
> = {
  "missing-title": "이벤트명",
  "missing-course": "과목명",
  "missing-date": "정확한 날짜",
  "missing-details": "요구사항·분량·제출 방식 중 하나",
  "missing-exam-scope": "시험 범위",
  "missing-class-time": "수업 요일과 시작·종료 시간",
};
