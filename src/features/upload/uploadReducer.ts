import type { ExtractionResult } from "../../domain/types";

export type UploadUiState =
  | { status: "idle"; files: File[] }
  | { status: "selected"; files: File[] }
  | { status: "extracting"; files: File[]; operationId: string }
  | { status: "ready"; files: File[]; result: ExtractionResult }
  | { status: "error"; files: File[]; message: string }
  | { status: "invalid"; files: File[]; message: string };

export type UploadUiEvent =
  | { type: "files/added"; files: File[] }
  | { type: "files/invalid"; message: string }
  | { type: "file/removed"; index: number }
  | { type: "files/cleared" }
  | { type: "extraction/started"; operationId: string }
  | { type: "extraction/succeeded"; result: ExtractionResult }
  | { type: "extraction/failed"; message: string };

export function uploadReducer(state: UploadUiState, event: UploadUiEvent): UploadUiState {
  switch (event.type) {
    case "files/added": {
      const files = [...state.files, ...event.files];
      return { status: files.length ? "selected" : "idle", files };
    }
    case "files/invalid": return { status: "invalid", files: state.files, message: event.message };
    case "file/removed": {
      const files = state.files.filter((_, index) => index !== event.index);
      return { status: files.length ? "selected" : "idle", files };
    }
    case "files/cleared": return { status: "idle", files: [] };
    case "extraction/started": return { status: "extracting", files: state.files, operationId: event.operationId };
    case "extraction/succeeded": return { status: "ready", files: state.files, result: event.result };
    case "extraction/failed": return { status: "error", files: state.files, message: event.message };
  }
}
