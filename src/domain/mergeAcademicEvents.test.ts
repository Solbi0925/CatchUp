import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { mergeAcademicEventBatch, mergeUserSelectedAcademicEvents, splitAcademicEventBySources } from "./mergeAcademicEvents";

describe("mergeAcademicEventBatch", () => {
  it("fills an existing unconfirmed event and preserves all source references", () => {
    const existing = academicEventFixture({
      id: "existing-assignment-1",
      date: null,
      requirements: null,
      workload: null,
      submissionMethod: null,
      confirmationStatus: "unconfirmed",
      confirmationIssues: ["missing-date", "missing-details"],
    });
    const incoming = academicEventFixture({
      id: "new-model-id",
      documentId: "doc-2",
      sourceDocumentIds: ["doc-2"],
      sourceReferences: [{
        id: "source-2",
        documentId: "doc-2",
        fileName: "과제1_명세서.pdf",
        documentType: "assignment-brief",
        evidence: "9월 2일 LMS 제출",
      }],
      title: "보고서 과제",
      date: "2026-09-02",
      requirements: "분석 보고서 PDF 제출",
      updatedAt: "2026-08-12T12:00:00.000Z",
    });

    const [merged] = mergeAcademicEventBatch([existing], [incoming]);
    expect(merged).toMatchObject({
      id: "existing-assignment-1",
      date: "2026-09-02",
      requirements: "분석 보고서 PDF 제출",
      confirmationStatus: "confirmed",
      confirmationIssues: [],
      reviewStatus: "needs-review",
    });
    expect(merged.sourceDocumentIds).toEqual(["doc-1", "doc-2"]);
    expect(merged.sourceReferences).toHaveLength(2);
  });

  it("does not heuristically merge an already confirmed event", () => {
    const existing = academicEventFixture({ id: "confirmed-1" });
    const incoming = academicEventFixture({ id: "new-1" });
    expect(mergeAcademicEventBatch([existing], [incoming])[0].id).toBe("new-1");
  });

  it("merges user-selected events while preserving edited values and provenance", () => {
    const first = academicEventFixture({ id: "midterm-ko", title: "행정기획론 중간고사", isUserEdited: true });
    const second = academicEventFixture({ id: "midterm-en", title: "Midterm Exam", documentId: "doc-2", sourceDocumentIds: ["doc-2"], sourceReferences: [{ id: "source-2", documentId: "doc-2", fileName: "notice.pdf", documentType: "exam-notice", evidence: "Midterm Exam" }] });
    const merged = mergeUserSelectedAcademicEvents([first, second]);
    expect(merged).toMatchObject({ id: "midterm-ko", title: "행정기획론 중간고사", isUserEdited: true, reviewStatus: "needs-review" });
    expect(merged.sourceDocumentIds).toEqual(["doc-2", "doc-1"]);
    expect(merged.sourceReferences).toHaveLength(2);
  });

  it("splits a merged event into source-backed drafts without inventing provenance", () => {
    const merged = academicEventFixture({ sourceDocumentIds: ["doc-1", "doc-2"], sourceReferences: [
      { id: "source-1", documentId: "doc-1", fileName: "syllabus.pdf", documentType: "syllabus", evidence: "8주차 시험" },
      { id: "source-2", documentId: "doc-2", fileName: "exam.pdf", documentType: "exam-notice", evidence: "9월 3일 시험" },
    ] });
    const split = splitAcademicEventBySources(merged);
    expect(split).toHaveLength(2);
    expect(split.map((item) => item.sourceReferences)).toEqual([[merged.sourceReferences[0]], [merged.sourceReferences[1]]]);
    expect(split.every((item) => item.reviewStatus === "needs-review")).toBe(true);
  });
});
