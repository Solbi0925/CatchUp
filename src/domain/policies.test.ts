import { describe, expect, it } from "vitest";
import {
  getPlanWindow,
  isSupportedAcademicFile,
  validatePlanPrerequisites,
} from "./policies";
import type { ExtractedItem, UploadedDocument, User } from "./types";

const user: User = {
  id: "user-demo-01",
  displayName: "테스트 학생",
  calendarConnectionStatus: "connected",
  planGenerationRequest: "앞으로 7일 동안 쉬는 시간을 많이 확보해줘.",
};

const document: UploadedDocument = {
  id: "doc-1",
  userId: user.id,
  fileName: "강의계획서.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2_400_000,
  documentType: "syllabus",
  supportedFileFormat: "pdf",
  uploadStatus: "complete",
  extractionStatus: "complete",
  uploadedAt: "2026-07-19T20:00:00+09:00",
};

const item: ExtractedItem = {
  id: "item-1",
  documentId: document.id,
  title: "UX 리서치 보고서",
  itemType: "assignment",
  courseName: "UX 디자인",
  date: "2026-07-23",
  time: "23:59",
  submissionMethod: "LMS",
  requiredMaterials: "보고서 PDF",
  difficulty: "high",
  estimatedDurationMinutes: 180,
  reviewStatus: "confirmed",
  isUserEdited: false,
};

describe("academic file policy", () => {
  it("accepts PDF and image MIME types without imposing a size limit", () => {
    expect(isSupportedAcademicFile({ type: "application/pdf" })).toBe(true);
    expect(isSupportedAcademicFile({ type: "image/png" })).toBe(true);
    expect(isSupportedAcademicFile({ type: "video/mp4" })).toBe(false);
  });
});

describe("7-day plan policy", () => {
  it("uses the request date as Day 1 and creates an exact seven-day window", () => {
    expect(getPlanWindow(new Date("2026-07-22T09:00:00+09:00"))).toEqual({
      planStartDate: "2026-07-22",
      planEndDate: "2026-07-28",
      referenceWindowEndDate: "2026-08-18",
    });
  });

  it("blocks generation until every extracted item is confirmed", () => {
    const result = validatePlanPrerequisites({
      user,
      documents: [document],
      extractedItems: [{ ...item, reviewStatus: "needs-review" }],
    });

    expect(result).toEqual({ ok: false, reason: "needs-review" });
  });

  it("allows generation on any request day when upload, review and calendar checks pass", () => {
    const result = validatePlanPrerequisites({
      user,
      documents: [document],
      extractedItems: [item],
    });

    expect(result).toEqual({ ok: true });
  });
});
