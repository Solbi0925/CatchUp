import { assessAcademicEventConfirmation } from "./academicEventStatus";
import type { ExtractedItem, SourceReference } from "./types";

function normalized(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function isLikelySameEvent(existing: ExtractedItem, incoming: ExtractedItem) {
  if (existing.confirmationStatus !== "unconfirmed") return false;
  const existingCourse = normalized(existing.courseName);
  const incomingCourse = normalized(incoming.courseName);
  if (!existingCourse || !incomingCourse || existingCourse !== incomingCourse) return false;
  const existingTitle = normalized(existing.title);
  const incomingTitle = normalized(incoming.title);
  if (!existingTitle || !incomingTitle) return false;
  return existingTitle === incomingTitle || (
    Math.min(existingTitle.length, incomingTitle.length) >= 3 &&
    (existingTitle.includes(incomingTitle) || incomingTitle.includes(existingTitle))
  );
}

function mergeReferences(existing: SourceReference[], incoming: SourceReference[]) {
  const byDocumentId = new Map(existing.map((reference) => [reference.documentId, reference]));
  for (const reference of incoming) byDocumentId.set(reference.documentId, reference);
  return [...byDocumentId.values()];
}

function preferIncoming<T>(incoming: T | null, existing: T | null) {
  return incoming ?? existing;
}

function mergeClassMeetingTimes(
  existing: ExtractedItem["classMeetingTimes"],
  incoming: ExtractedItem["classMeetingTimes"],
) {
  const meetings = incoming.length > 0 ? incoming : existing;
  return meetings.map((meeting, index) => ({
    ...meeting,
    id: meeting.id || `meeting-${index}`,
  }));
}

export function mergeAcademicEvent(
  existing: ExtractedItem,
  incoming: ExtractedItem,
): ExtractedItem {
  const sourceReferences = mergeReferences(existing.sourceReferences, incoming.sourceReferences);
  const merged: ExtractedItem = {
    ...existing,
    ...incoming,
    id: existing.id,
    documentId: sourceReferences[0]?.documentId ?? existing.documentId,
    sourceDocumentIds: [...new Set([
      ...existing.sourceDocumentIds,
      ...incoming.sourceDocumentIds,
    ])],
    sourceReferences,
    title: incoming.title.trim() || existing.title,
    courseName: incoming.courseName.trim() || existing.courseName,
    courseCode: preferIncoming(incoming.courseCode, existing.courseCode),
    date: preferIncoming(incoming.date, existing.date),
    time: preferIncoming(incoming.time, existing.time),
    isAllDay: incoming.isAllDay ?? existing.isAllDay ?? false,
    scheduledWeek: preferIncoming(incoming.scheduledWeek, existing.scheduledWeek),
    scheduledWeekLabel: preferIncoming(incoming.scheduledWeekLabel, existing.scheduledWeekLabel),
    weekOneStartDate: preferIncoming(incoming.weekOneStartDate, existing.weekOneStartDate),
    classMeetingTimes: mergeClassMeetingTimes(
      existing.classMeetingTimes,
      incoming.classMeetingTimes,
    ),
    assignmentType: preferIncoming(incoming.assignmentType, existing.assignmentType),
    examType: preferIncoming(incoming.examType, existing.examType),
    workload: preferIncoming(incoming.workload, existing.workload),
    requirements: preferIncoming(incoming.requirements, existing.requirements),
    deliverableComplexity: preferIncoming(
      incoming.deliverableComplexity,
      existing.deliverableComplexity,
    ),
    examScope: preferIncoming(incoming.examScope, existing.examScope),
    gradingMethod: preferIncoming(incoming.gradingMethod, existing.gradingMethod),
    submissionMethod: preferIncoming(incoming.submissionMethod, existing.submissionMethod),
    requiredMaterials: preferIncoming(incoming.requiredMaterials, existing.requiredMaterials),
    researchNeeded: incoming.researchNeeded === "unknown"
      ? existing.researchNeeded
      : incoming.researchNeeded,
    difficulty: incoming.difficulty === "unknown" ? existing.difficulty : incoming.difficulty,
    estimatedDurationMinutes: preferIncoming(
      incoming.estimatedDurationMinutes,
      existing.estimatedDurationMinutes,
    ),
    confidence: Math.max(existing.confidence, incoming.confidence),
    uncertaintyNotes: [...new Set([
      ...existing.uncertaintyNotes,
      ...incoming.uncertaintyNotes,
    ])],
    reviewStatus: "needs-review",
    isUserEdited: existing.isUserEdited,
    updatedAt: incoming.updatedAt,
    revision: Math.max(existing.revision ?? 1, incoming.revision ?? 1) + 1,
    updateNoticeStatus: "unread",
  };
  return { ...merged, ...assessAcademicEventConfirmation(merged) };
}

export function mergeAcademicEventBatch(
  existingItems: readonly ExtractedItem[],
  incomingItems: readonly ExtractedItem[],
) {
  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  const claimedExistingIds = new Set<string>();

  return incomingItems.map((incoming) => {
    const explicit = existingById.get(incoming.id);
    const fallback = explicit ?? existingItems.find((existing) =>
      !claimedExistingIds.has(existing.id) && isLikelySameEvent(existing, incoming));
    if (!fallback) return {
      ...incoming,
      revision: incoming.revision ?? 1,
      updateNoticeStatus: "unread" as const,
      ...assessAcademicEventConfirmation(incoming),
    };
    claimedExistingIds.add(fallback.id);
    return mergeAcademicEvent(fallback, incoming);
  });
}

export function mergeUserSelectedAcademicEvents(items: readonly ExtractedItem[]) {
  if (items.length < 2) throw new Error("병합할 이벤트가 두 개 이상 필요합니다.");
  const preferred = items.find((item) => item.isUserEdited) ?? items[0];
  const others = items.filter((item) => item.id !== preferred.id);
  const merged = others.reduce((current, item) => mergeAcademicEvent(item, current), preferred);
  return {
    ...merged,
    id: preferred.id,
    title: preferred.title,
    courseName: preferred.courseName,
    reviewStatus: "needs-review" as const,
    isUserEdited: true,
    uncertaintyNotes: [...new Set([...merged.uncertaintyNotes, "사용자가 여러 추출 이벤트를 직접 병합했습니다."])],
  };
}

export function splitAcademicEventBySources(item: ExtractedItem) {
  if (item.sourceReferences.length < 2) return [];
  return item.sourceReferences.map((source, index) => {
    const split = {
      ...item,
      id: `${item.id}-split-${index + 1}-${Date.now()}`,
      documentId: source.documentId,
      sourceDocumentIds: [source.documentId],
      sourceReferences: [source],
      title: `${item.title} (분리 ${index + 1})`,
      reviewStatus: "needs-review" as const,
      isUserEdited: true,
      uncertaintyNotes: [...new Set([...item.uncertaintyNotes, `원본 자료 '${source.fileName}' 기준으로 분리됨`])],
    };
    return { ...split, ...assessAcademicEventConfirmation(split) };
  });
}
