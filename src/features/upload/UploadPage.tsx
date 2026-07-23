import { useEffect, useReducer, useRef } from "react";
import { Link } from "react-router-dom";
import { demoClock } from "../../application/clock";
import { isSupportedAcademicFile } from "../../domain/policies";
import { selectDocuments } from "../../domain/selectors";
import type { UploadedDocument } from "../../domain/types";
import { extractAcademicFile } from "../../mocks/mockExtractionAdapter";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { ChevronRightIcon, FolderIcon, UploadCloudIcon } from "../../ui/icons";
import { uploadReducer } from "./uploadReducer";
import "./upload.css";

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))}KB`;
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

function formatDate(isoDate: string) {
  return isoDate.slice(0, 10);
}

function FileTypeIcon({ format }: { format: UploadedDocument["supportedFileFormat"] }) {
  return <div className="file-type-icon">{format === "pdf" ? "PDF" : "IMG"}</div>;
}

function DocumentCard({ document }: { document: UploadedDocument }) {
  const badgeText = document.extractionStatus === "complete" ? "추출 완료" : "확인 필요";
  return (
    <Link
      className="document-card"
      to={`/upload/${document.id}/extraction`}
      aria-label={`${document.fileName} 추출 결과 확인`}
    >
      <FileTypeIcon format={document.supportedFileFormat} />
      <div className="document-card__text">
        <strong title={document.fileName}>{document.fileName}</strong>
        <span>{formatBytes(document.sizeBytes)}&nbsp;&nbsp;·&nbsp;&nbsp;{formatDate(document.uploadedAt)}</span>
      </div>
      <span className={`status-badge status-badge--${document.extractionStatus}`}>{badgeText}</span>
      <ChevronRightIcon className="chevron-icon" />
    </Link>
  );
}

export function UploadPage() {
  const { state: store, dispatch: storeDispatch } = usePrototypeStore();
  const [uiState, dispatch] = useReducer(uploadReducer, { status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const documents = selectDocuments(store);

  useEffect(() => () => abortRef.current?.abort(), []);

  function selectFile(file?: File) {
    if (!file) return;
    abortRef.current?.abort();
    if (!isSupportedAcademicFile(file)) {
      dispatch({ type: "file/invalid", message: "PDF 또는 이미지 파일을 선택해주세요." });
      return;
    }
    dispatch({ type: "file/selected", file });
  }

  async function analyze(file: File) {
    const operationId = `extract-${Date.now()}`;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    dispatch({ type: "extraction/started", operationId, file });
    try {
      const result = await extractAcademicFile({
        file,
        operationId,
        clock: demoClock,
        signal: controller.signal,
      });
      storeDispatch({ type: "extraction/applied", payload: result });
      dispatch({ type: "extraction/succeeded", result });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({
        type: "extraction/failed",
        file,
        message: "자료를 분석하지 못했어요. 다시 시도해주세요.",
      });
    }
  }

  const activeFile =
    uiState.status === "selected" || uiState.status === "extracting" || uiState.status === "error"
      ? uiState.file
      : null;

  return (
    <section className="upload-page">
      <header className="upload-header">
        <h1>자료 업로드</h1>
        <button
          type="button"
          className="icon-button"
          aria-label="학업 자료 선택"
          disabled={uiState.status === "extracting"}
          onClick={() => inputRef.current?.click()}
        >
          <FolderIcon />
        </button>
      </header>

      <label className="upload-zone" htmlFor="academic-file">
        <UploadCloudIcon />
        <strong>학업 자료 업로드</strong>
        <span>PDF 또는 이미지 파일</span>
      </label>
      <input
        ref={inputRef}
        id="academic-file"
        className="sr-only"
        type="file"
        accept="application/pdf,image/*"
        aria-label="학업 자료 업로드"
        disabled={uiState.status === "extracting"}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {uiState.status === "invalid" && <p className="inline-error">{uiState.message}</p>}

      {activeFile && (
        <div className="selected-section">
          <h2>선택한 자료</h2>
          <div className="document-card">
            <FileTypeIcon format={activeFile.type === "application/pdf" ? "pdf" : "image"} />
            <div className="document-card__text">
              <strong>{activeFile.name}</strong>
              <span>{formatBytes(activeFile.size)}</span>
            </div>
            {uiState.status === "extracting" && <span className="status-badge">추출 중</span>}
          </div>
          {uiState.status === "error" && <p className="inline-error">{uiState.message}</p>}
          <div className="selection-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={uiState.status === "extracting"}
              onClick={() => dispatch({ type: "file/removed" })}
            >
              제거
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={uiState.status === "extracting"}
              onClick={() => analyze(activeFile)}
            >
              {uiState.status === "extracting"
                ? "분석 중..."
                : uiState.status === "error"
                  ? "다시 시도"
                  : "자료 분석하기"}
            </button>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <section className="uploaded-section">
          <h2>업로드된 자료</h2>
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
          <Link
            className="extraction-callout"
            to={`/upload/${documents[0].id}/extraction`}
          >
            <span>
              <strong>추출 결과 확인 및 수정</strong>
              <small>AI가 추출한 정보를 확인하고<br />필요 시 수정할 수 있어요</small>
            </span>
            <ChevronRightIcon />
          </Link>
        </section>
      )}
    </section>
  );
}
