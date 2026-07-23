import type { ExtractionResult } from "../../domain/types";

export type UploadUiState =
  | { status: "idle" }
  | { status: "selected"; file: File }
  | { status: "extracting"; file: File; operationId: string }
  | { status: "ready"; result: ExtractionResult }
  | { status: "error"; file: File; message: string }
  | { status: "invalid"; message: string };

export type UploadUiEvent =
  | { type: "file/selected"; file: File }
  | { type: "file/invalid"; message: string }
  | { type: "file/removed" }
  | { type: "extraction/started"; operationId: string; file: File }
  | { type: "extraction/succeeded"; result: ExtractionResult }
  | { type: "extraction/failed"; file: File; message: string };

export function uploadReducer(_state: UploadUiState, event: UploadUiEvent): UploadUiState {
  switch (event.type) {
    case "file/selected":
      return { status: "selected", file: event.file };
    case "file/invalid":
      return { status: "invalid", message: event.message };
    case "file/removed":
      return { status: "idle" };
    case "extraction/started":
      return { status: "extracting", file: event.file, operationId: event.operationId };
    case "extraction/succeeded":
      return { status: "ready", result: event.result };
    case "extraction/failed":
      return { status: "error", file: event.file, message: event.message };
  }
}
