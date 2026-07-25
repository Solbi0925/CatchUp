import { describe, expect, it } from "vitest";
import { createFixedClock } from "../application/clock";
import { extractAcademicFile } from "./mockExtractionAdapter";

describe("extractAcademicFile", () => {
  it("creates a runtime document and reviewable extracted items from a local file", async () => {
    const file = new File(["sample"], "강의계획서.pdf", { type: "application/pdf" });
    const result = await extractAcademicFile({
      file,
      operationId: "extract-runtime-1",
      clock: createFixedClock("2026-07-19T20:00:00+09:00"),
      delayMs: 0,
    });

    expect(result.document.id).toBe("doc-extract-runtime-1");
    expect(result.document.fileName).toBe("강의계획서.pdf");
    expect(result.extractedItems.every((item) => item.documentId === result.document.id)).toBe(true);
    expect(result.extractedItems.some((item) => item.reviewStatus === "needs-review")).toBe(true);
  });

  it("rejects an aborted operation without producing a result", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractAcademicFile({
        file: new File(["sample"], "강의계획서.pdf", { type: "application/pdf" }),
        operationId: "extract-aborted",
        clock: createFixedClock("2026-07-19T20:00:00+09:00"),
        signal: controller.signal,
        delayMs: 0,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
