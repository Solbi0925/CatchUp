import type { ExtractedItem, PlanUpdateReasonKind, PlanUpdateRecommendation } from "./types";

const planningFields: Array<keyof ExtractedItem> = [
  "title", "courseName", "date", "time", "scheduledWeek", "weekOneStartDate",
  "workload", "requirements", "examScope", "difficulty", "estimatedDurationMinutes",
  "confirmationStatus", "reviewStatus",
];

export function isPlanningRelevant(item: ExtractedItem) {
  if (item.itemType === "class-schedule") return false;
  return item.confirmationStatus === "confirmed";
}

export function hasMeaningfulPlanningChange(previous: ExtractedItem | undefined, next: ExtractedItem) {
  if (!previous) return isPlanningRelevant(next);
  return planningFields.some((field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]));
}

function reasonFor(items: ExtractedItem[], previousById: Record<string, ExtractedItem | undefined>): PlanUpdateReasonKind {
  if (items.some((item) => {
    const previous = previousById[item.id];
    return (item.itemType === "exam" || item.itemType === "quiz") && previous && (
      previous.date !== item.date || previous.examScope !== item.examScope || previous.confirmationStatus !== item.confirmationStatus
    );
  })) return "exam-updated";
  if (items.some((item) => !previousById[item.id])) return "new-academic-event";
  if (items.some((item) => ["assignment", "team-project", "presentation"].includes(item.itemType))) return "assignment-updated";
  return "schedule-updated";
}

export function createPlanUpdateRecommendation(
  previousById: Record<string, ExtractedItem | undefined>,
  candidates: ExtractedItem[],
  detectedAt: string,
): PlanUpdateRecommendation | null {
  const changed = candidates.filter((item) => hasMeaningfulPlanningChange(previousById[item.id], item) && (
    isPlanningRelevant(item) || isPlanningRelevant(previousById[item.id] ?? item)
  ));
  if (!changed.length) return null;
  const reasonKind = reasonFor(changed, previousById);
  const messages: Record<PlanUpdateReasonKind, string> = {
    "exam-updated": "수정된 시험 정보를 바탕으로 주간계획을 정리할게요.",
    "assignment-updated": "새로운 과제 정보를 반영해 주간계획을 정리할게요.",
    "new-academic-event": "새로운 학업 일정을 반영해 주간계획을 정리할게요.",
    "schedule-updated": "변경된 학업 일정을 반영해 주간계획을 정리할게요.",
  };
  return {
    id: `plan-update-${detectedAt}-${changed.map((item) => item.id).join("-")}`,
    reasonKind,
    academicEventIds: changed.map((item) => item.id),
    message: messages[reasonKind],
    detectedAt,
    status: "pending",
    noticeStatus: "unread",
    previousAcademicEvents: changed.flatMap((item) => previousById[item.id] ? [previousById[item.id]!] : []),
  };
}
