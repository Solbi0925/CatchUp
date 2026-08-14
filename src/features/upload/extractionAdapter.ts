import { demoClock } from "../../application/clock";
import type { ExtractedItem, ExtractionResult } from "../../domain/types";
import { extractAcademicFilesMock } from "../../mocks/mockExtractionAdapter";

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return window.btoa(binary);
}

export async function analyzeAcademicFiles(input: {
  files: File[];
  operationId: string;
  existingEvents: ExtractedItem[];
  signal?: AbortSignal;
}): Promise<ExtractionResult> {
  if (import.meta.env.MODE === "test") {
    return extractAcademicFilesMock({ ...input, clock: demoClock });
  }
  const files = await Promise.all(input.files.map(async (file) => ({
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    base64: await fileToBase64(file),
  })));
  const response = await fetch("/api/academic-materials/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: input.operationId,
      files,
      existingEvents: input.existingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        itemType: event.itemType,
        courseName: event.courseName,
        courseCode: event.courseCode,
        date: event.date,
        time: event.time,
        scheduledWeek: event.scheduledWeek,
        scheduledWeekLabel: event.scheduledWeekLabel,
        weekOneStartDate: event.weekOneStartDate,
        classMeetingTimes: event.classMeetingTimes,
        assignmentType: event.assignmentType,
        examType: event.examType,
        workload: event.workload,
        requirements: event.requirements,
        examScope: event.examScope,
        submissionMethod: event.submissionMethod,
        confirmationStatus: event.confirmationStatus,
      })),
    }),
    signal: input.signal,
  });
  const payload = await response.json().catch(() => null) as ExtractionResult | { error?: string } | null;
  if (!response.ok || !payload || !("documents" in payload)) {
    throw new Error(payload && "error" in payload ? payload.error : "analysis-failed");
  }
  return payload;
}
