import { describe, expect, it } from "vitest";
import { createFixedClock } from "../application/clock";
import { extractAcademicFilesMock } from "./mockExtractionAdapter";

describe("extractAcademicFilesMock", () => {
  it("creates a runtime document and reviewable extracted items from a local file", async () => {
    const file = new File(["sample"], "강의계획서.pdf", { type: "application/pdf" });
    const result = await extractAcademicFilesMock({
      files: [file],
      operationId: "extract-runtime-1",
      clock: createFixedClock("2026-07-19T20:00:00+09:00"),
      delayMs: 0,
    });

    expect(result.documents[0].id).toBe("doc-extract-runtime-1-0");
    expect(result.documents[0].fileName).toBe("강의계획서.pdf");
    expect(result.extractedItems.every((item) => item.sourceDocumentIds.includes(result.documents[0].id))).toBe(true);
    expect(result.extractedItems.some((item) => item.reviewStatus === "needs-review")).toBe(true);
  });

  it("rejects an aborted operation without producing a result", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractAcademicFilesMock({
        files: [new File(["sample"], "강의계획서.pdf", { type: "application/pdf" })],
        operationId: "extract-aborted",
        clock: createFixedClock("2026-07-19T20:00:00+09:00"),
        signal: controller.signal,
        delayMs: 0,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
