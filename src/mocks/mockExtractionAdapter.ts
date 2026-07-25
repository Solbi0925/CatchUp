import type { Clock } from "../application/clock";
import type { ExtractedItem, ExtractionResult } from "../domain/types";

interface ExtractAcademicFileInput {
  file: File;
  operationId: string;
  clock: Clock;
  signal?: AbortSignal;
  delayMs?: number;
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function wait(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

function createExtractedItems(documentId: string, operationId: string): ExtractedItem[] {
  return [
    {
      id: `item-${operationId}-assignment`,
      documentId,
      title: "UX 리서치 보고서",
      itemType: "assignment",
      courseName: "UX 디자인",
      date: "2026-07-23",
      time: "23:59",
      submissionMethod: "LMS 과제함",
      requiredMaterials: "리서치 결과, 보고서 PDF",
      difficulty: "high",
      estimatedDurationMinutes: 180,
      reviewStatus: "needs-review",
      isUserEdited: false,
    },
    {
      id: `item-${operationId}-exam`,
      documentId,
      title: "정규화 개념 퀴즈",
      itemType: "exam",
      courseName: "데이터베이스",
      date: "2026-07-25",
      time: "10:00",
      submissionMethod: "LMS 응시",
      requiredMaterials: "교재 4장, 강의 노트",
      difficulty: "medium",
      estimatedDurationMinutes: 120,
      reviewStatus: "confirmed",
      isUserEdited: false,
    },
    {
      id: `item-${operationId}-class`,
      documentId,
      title: "ERD 실습 준비",
      itemType: "class-schedule",
      courseName: "데이터베이스",
      date: "2026-07-22",
      time: "13:00",
      submissionMethod: null,
      requiredMaterials: "노트북, 실습 파일",
      difficulty: "low",
      estimatedDurationMinutes: 30,
      reviewStatus: "confirmed",
      isUserEdited: false,
    },
  ];
}

export async function extractAcademicFile({
  file,
  operationId,
  clock,
  signal,
  delayMs = 900,
}: ExtractAcademicFileInput): Promise<ExtractionResult> {
  await wait(delayMs, signal);
  if (file.name.toLowerCase().includes("fail")) {
    throw new Error("mock-extraction-failed");
  }
  const documentId = `doc-${operationId}`;
  const extractedItems = createExtractedItems(documentId, operationId);
  return {
    operationId,
    document: {
      id: documentId,
      userId: "user-demo-01",
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      documentType: "syllabus",
      supportedFileFormat: file.type === "application/pdf" ? "pdf" : "image",
      uploadStatus: "complete",
      extractionStatus: extractedItems.some((item) => item.reviewStatus === "needs-review")
        ? "needs-review"
        : "complete",
      uploadedAt: clock.now().toISOString(),
    },
    extractedItems,
  };
}
