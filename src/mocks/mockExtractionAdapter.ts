import type { Clock } from "../application/clock";
import type { ExtractedItem, ExtractionResult, UploadedDocument } from "../domain/types";

interface ExtractAcademicFilesInput {
  files: File[];
  operationId: string;
  existingEvents?: ExtractedItem[];
  clock: Clock;
  signal?: AbortSignal;
  delayMs?: number;
}

function wait(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export async function extractAcademicFilesMock({
  files,
  operationId,
  clock,
  signal,
  delayMs = 50,
}: ExtractAcademicFilesInput): Promise<ExtractionResult> {
  await wait(delayMs, signal);
  if (files.some((file) => file.name.toLowerCase().includes("fail"))) throw new Error("mock-failed");
  const documents: UploadedDocument[] = files.map((file, index) => ({
    id: `doc-${operationId}-${index}`,
    userId: "user-demo-01",
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    documentType: /시간표|timetable/i.test(file.name)
      ? "timetable"
      : index === 0 ? "syllabus" : "lms-notice",
    supportedFileFormat: file.type === "application/pdf" ? "pdf" : "image",
    uploadStatus: "complete",
    extractionStatus: "needs-review",
    uploadedAt: clock.now().toISOString(),
  }));
  const primary = documents[0];
  if (files.every((file) => /empty|학업정보없음|무관한/i.test(file.name))) {
    return { operationId, documents, extractedItems: [] };
  }
  const sourceReferences = documents.map((document, index) => ({
    id: `source-${operationId}-${index}`,
    documentId: document.id,
    fileName: document.fileName,
    documentType: document.documentType,
    evidence: document.documentType === "timetable"
      ? "요일과 시간대에 표시된 수업 블록"
      : index === 0 ? "과제 안내 및 평가 기준" : "변경된 제출 마감 안내",
  }));
  if (documents.some((document) => document.documentType === "timetable")) {
    const timetableSource = sourceReferences.filter((source) => source.documentType === "timetable");
    const timetableDocumentIds = timetableSource.map((source) => source.documentId);
    const extractedItems: ExtractedItem[] = [{
      id: `item-${operationId}-timetable-urban`,
      documentId: timetableDocumentIds[0],
      sourceDocumentIds: timetableDocumentIds,
      sourceReferences: timetableSource,
      title: "도시건축",
      itemType: "class-schedule",
      courseName: "도시건축",
      courseCode: null,
      date: null,
      dateCertainty: "unknown",
      time: null,
      isAllDay: false,
      scheduledWeek: null,
      scheduledWeekLabel: null,
      weekOneStartDate: null,
      classMeetingTimes: [
        { id: `meeting-${operationId}-urban-1`, weekday: 1, startTime: "10:30", endTime: "11:45", location: "401-930" },
        { id: `meeting-${operationId}-urban-2`, weekday: 3, startTime: "10:30", endTime: "11:45", location: "401-930" },
      ],
      assignmentType: null,
      examType: null,
      workload: null,
      requirements: null,
      researchNeeded: "unknown",
      deliverableComplexity: null,
      examScope: null,
      gradingMethod: null,
      submissionMethod: null,
      requiredMaterials: null,
      difficulty: "unknown",
      estimatedDurationMinutes: null,
      confidence: .88,
      uncertaintyNotes: [],
      confirmationStatus: "confirmed",
      confirmationIssues: [],
      updatedAt: clock.now().toISOString(),
      revision: 1,
      updateNoticeStatus: "unread",
      reviewStatus: "needs-review",
      isUserEdited: false,
    }];
    return { operationId, documents, extractedItems };
  }
  const extractedItems: ExtractedItem[] = [{
    id: `item-${operationId}-assignment`,
    documentId: primary.id,
    sourceDocumentIds: documents.map((document) => document.id),
    sourceReferences,
    title: "UX 리서치 보고서",
    itemType: "assignment",
    courseName: "UX 디자인",
    courseCode: "UXD201",
    date: "2026-07-23",
    dateCertainty: "exact-date",
    time: "23:59",
    isAllDay: false,
    scheduledWeek: null,
    scheduledWeekLabel: null,
    weekOneStartDate: null,
    classMeetingTimes: [],
    assignmentType: "report",
    examType: null,
    workload: "A4 5쪽 내외",
    requirements: "사용자 인터뷰 결과와 인사이트를 포함한 PDF 보고서 제출",
    researchNeeded: "medium",
    deliverableComplexity: "조사 결과가 포함된 보고서",
    examScope: null,
    gradingMethod: null,
    submissionMethod: "LMS 과제함",
    requiredMaterials: "익명화된 인터뷰 메모",
    difficulty: "high",
    estimatedDurationMinutes: 180,
    confidence: .78,
    uncertaintyNotes: ["LMS 공지의 마감 변경 여부를 확인해주세요."],
    confirmationStatus: "confirmed",
    confirmationIssues: [],
    updatedAt: clock.now().toISOString(),
    revision: 1,
    updateNoticeStatus: "unread",
    reviewStatus: "needs-review",
    isUserEdited: false,
  }, {
    id: `item-${operationId}-exam`,
    documentId: primary.id,
    sourceDocumentIds: [primary.id],
    sourceReferences: sourceReferences.slice(0, 1),
    title: "정규화 개념 퀴즈",
    itemType: "exam",
    courseName: "데이터베이스",
    courseCode: null,
    date: "2026-07-25",
    dateCertainty: "exact-date",
    time: "10:00",
    isAllDay: false,
    scheduledWeek: 8,
    scheduledWeekLabel: "8주차",
    weekOneStartDate: null,
    classMeetingTimes: [],
    assignmentType: null,
    examType: "LMS 퀴즈",
    workload: null,
    requirements: "응시 전 인증 확인",
    researchNeeded: "none",
    deliverableComplexity: null,
    examScope: "교재 4장, 정규화",
    gradingMethod: "점수제",
    submissionMethod: "LMS 응시",
    requiredMaterials: "강의 노트",
    difficulty: "medium",
    estimatedDurationMinutes: 120,
    confidence: .9,
    uncertaintyNotes: [],
    confirmationStatus: "confirmed",
    confirmationIssues: [],
    updatedAt: clock.now().toISOString(),
    revision: 1,
    updateNoticeStatus: "unread",
    reviewStatus: "needs-review",
    isUserEdited: false,
  }, {
    id: `item-${operationId}-class`,
    documentId: primary.id,
    sourceDocumentIds: [primary.id],
    sourceReferences: sourceReferences.slice(0, 1),
    title: "ERD 실습 준비",
    itemType: "class-schedule",
    courseName: "데이터베이스",
    courseCode: null,
    date: "2026-07-22",
    dateCertainty: "exact-date",
    time: "13:00",
    isAllDay: false,
    scheduledWeek: null,
    scheduledWeekLabel: null,
    weekOneStartDate: null,
    classMeetingTimes: [],
    assignmentType: null,
    examType: null,
    workload: null,
    requirements: "실습 파일 미리 다운로드",
    researchNeeded: "none",
    deliverableComplexity: null,
    examScope: null,
    gradingMethod: null,
    submissionMethod: null,
    requiredMaterials: "노트북, 실습 파일",
    difficulty: "low",
    estimatedDurationMinutes: 30,
    confidence: .92,
    uncertaintyNotes: [],
    confirmationStatus: "confirmed",
    confirmationIssues: [],
    updatedAt: clock.now().toISOString(),
    revision: 1,
    updateNoticeStatus: "unread",
    reviewStatus: "needs-review",
    isUserEdited: false,
  }];
  return { operationId, documents, extractedItems };
}
