import type { ExtractionResult } from "../../domain/types";

export type UploadFileStatus = "pending" | "extracting" | "complete" | "failed";
export interface UploadFileEntry { id: string; file: File; status: UploadFileStatus; addedAt: number; message?: string; }
export interface UploadUiState {
  status: "idle" | "selected" | "extracting" | "ready" | "error" | "invalid";
  files: UploadFileEntry[];
  operationId?: string;
  result?: ExtractionResult;
  message?: string;
}

export type UploadUiEvent =
  | { type: "files/added"; files: File[] }
  | { type: "files/invalid"; message: string }
  | { type: "file/removed"; id: string }
  | { type: "files/cleared" }
  | { type: "extraction/started"; operationId: string; fileIds: string[] }
  | { type: "extraction/succeeded"; result: ExtractionResult; fileIds: string[] }
  | { type: "extraction/failed"; message: string; fileIds: string[] };

function fileKey(file: File) { return `${file.name}:${file.size}:${file.lastModified}`; }

const statusPriority: Record<UploadFileStatus, number> = { pending: 0, extracting: 1, failed: 2, complete: 3 };

export function sortUploadFiles(entries: readonly UploadFileEntry[]) {
  return [...entries].sort((left, right) =>
    statusPriority[left.status] - statusPriority[right.status] || right.addedAt - left.addedAt,
  );
}

export function uploadReducer(state: UploadUiState, event: UploadUiEvent): UploadUiState {
  switch (event.type) {
    case "files/added": {
      const existing = new Set(state.files.map((entry) => fileKey(entry.file)));
      const addedAt = Date.now();
      const additions = event.files.filter((file) => !existing.has(fileKey(file))).map((file, index) => ({
        id: `upload-file-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        status: "pending" as const,
        addedAt: addedAt + index,
      }));
      const files = [...state.files, ...additions];
      return { status: files.length ? "selected" : "idle", files, result: state.result };
    }
    case "files/invalid": return { ...state, status: "invalid", message: event.message };
    case "file/removed": {
      const files = state.files.filter((entry) => entry.id !== event.id);
      return { status: files.length ? "selected" : "idle", files, result: state.result };
    }
    case "files/cleared": return { status: "idle", files: [] };
    case "extraction/started": {
      const ids = new Set(event.fileIds);
      return { ...state, status: "extracting", operationId: event.operationId, message: undefined, files: state.files.map((entry) => ids.has(entry.id) ? { ...entry, status: "extracting", message: undefined } : entry) };
    }
    case "extraction/succeeded": {
      const ids = new Set(event.fileIds);
      const empty = event.result.extractedItems.length === 0;
      return {
        status: empty ? "error" : "ready",
        files: state.files.map((entry) => ids.has(entry.id) ? { ...entry, status: empty ? "failed" : "complete", message: empty ? "이 자료에서 학업 정보를 찾지 못했어요." : undefined } : entry),
        result: event.result,
        message: empty ? "이 자료에서 학업 정보를 찾지 못했어요. 학업 일정, 과제, 시험 또는 수업 정보가 포함된 자료인지 확인해 주세요." : undefined,
      };
    }
    case "extraction/failed": {
      const ids = new Set(event.fileIds);
      return { ...state, status: "error", message: event.message, files: state.files.map((entry) => ids.has(entry.id) ? { ...entry, status: "failed", message: event.message } : entry) };
    }
  }
}
