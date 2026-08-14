import { useEffect, useReducer, useRef } from "react";
import { Link } from "react-router-dom";
import { isSupportedAcademicFile } from "../../domain/policies";
import { selectAllExtractedItems } from "../../domain/selectors";
import type { UploadedDocument } from "../../domain/types";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { resetCatchUpPrototype } from "../../store/resetPrototype";
import { ChevronRightIcon, FolderIcon, UploadCloudIcon } from "../../ui/icons";
import { analyzeAcademicFiles } from "./extractionAdapter";
import { uploadReducer } from "./uploadReducer";
import "./upload.css";

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))}KB`;
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

function FileTypeIcon({ format }: { format: UploadedDocument["supportedFileFormat"] }) {
  return <div className="file-type-icon">{format === "pdf" ? "PDF" : "IMG"}</div>;
}

export function UploadPage() {
  const { state: store, dispatch: storeDispatch } = usePrototypeStore();
  const [uiState, dispatch] = useReducer(uploadReducer, { status: "idle", files: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const events = selectAllExtractedItems(store);
  const previewEvents = events.slice(0, 4);

  useEffect(() => () => abortRef.current?.abort(), []);

  function addFiles(selected: File[]) {
    const invalid = selected.filter((file) => !isSupportedAcademicFile(file));
    const valid = selected.filter(isSupportedAcademicFile);
    if (valid.length) dispatch({ type: "files/added", files: valid });
    if (invalid.length) dispatch({ type: "files/invalid", message: "PDF 또는 이미지 파일만 추가할 수 있어요." });
  }

  async function analyze() {
    if (!uiState.files.length) return;
    const operationId = `extract-${Date.now()}`;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    dispatch({ type: "extraction/started", operationId });
    try {
      const result = await analyzeAcademicFiles({
        files: uiState.files,
        operationId,
        existingEvents: events,
        signal: controller.signal,
      });
      storeDispatch({ type: "extraction/applied", payload: result });
      dispatch({ type: "extraction/succeeded", result });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({
        type: "extraction/failed",
        message: error instanceof Error && error.message !== "analysis-failed"
          ? error.message
          : "자료를 통합 분석하지 못했어요. 로컬 브리지 실행 상태를 확인하고 다시 시도해주세요.",
      });
    }
  }

  const extracting = uiState.status === "extracting";
  return (
    <section className="upload-page">
      <header className="upload-header">
        <div><h1>자료 업로드</h1><p>여러 자료를 함께 분석해 과목과 이벤트별로 정리해요.</p></div>
        <button type="button" className="icon-button" aria-label="학업 자료 선택" disabled={extracting} onClick={() => inputRef.current?.click()}><FolderIcon /></button>
      </header>

      <label className="upload-zone" htmlFor="academic-files">
        <UploadCloudIcon /><strong>학업 자료 여러 개 업로드</strong><span>PDF와 이미지 · 순서에 상관없이 선택</span>
      </label>
      <input ref={inputRef} id="academic-files" className="sr-only" type="file" multiple accept="application/pdf,image/*" aria-label="학업 자료 업로드" disabled={extracting} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />

      {uiState.status === "invalid" && <p className="inline-error">{uiState.message}</p>}
      {uiState.files.length > 0 && (
        <section className="selected-section">
          <div className="section-heading"><h2>선택한 자료 <span>{uiState.files.length}</span></h2><button type="button" className="text-button" disabled={extracting} onClick={() => dispatch({ type: "files/cleared" })}>전체 제거</button></div>
          <div className="selected-file-list">
            {uiState.files.map((file, index) => (
              <div className="document-card" key={`${file.name}-${file.size}-${index}`}>
                <FileTypeIcon format={file.type === "application/pdf" ? "pdf" : "image"} />
                <div className="document-card__text"><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
                {extracting ? <span className="status-badge">분석 중</span> : <button className="remove-file" type="button" aria-label={`${file.name} 제거`} onClick={() => dispatch({ type: "file/removed", index })}>×</button>}
              </div>
            ))}
          </div>
          {uiState.status === "error" && <p className="inline-error">{uiState.message}</p>}
          {uiState.status === "ready" && (
            <div className="analysis-complete" role="status">
              <strong>추출 완료</strong>
              <span>{uiState.result.extractedItems.length}개의 학업 이벤트를 추출했어요. 아래에서 확인하고 수정할 수 있어요.</span>
            </div>
          )}
          <button type="button" className="primary-button analyze-batch-button" disabled={extracting} onClick={analyze}>{extracting ? `${uiState.files.length}개 자료 통합 분석 중...` : uiState.status === "ready" ? "모든 자료 다시 통합 분석하기" : "모든 자료 통합 분석하기"}</button>
        </section>
      )}

      {events.length > 0 && (
        <section className="uploaded-section">
          <Link className="event-review-entry" to="/upload/extraction" aria-label="학업 이벤트 전체 확인 및 수정">
            <div className="section-heading event-section-heading">
              <h2>학업 이벤트 <span>{events.length}</span></h2>
              <span className="event-list-chevron" aria-hidden="true"><ChevronRightIcon /></span>
            </div>
            <div className="event-preview-list">
              {previewEvents.map((event) => (
                <div className="event-preview" key={event.id}>
                  <span><strong>{event.title}</strong><small>{event.courseName} · {event.sourceReferences.length}개 자료 통합</small></span>
                  <span className={`status-badge status-badge--${event.confirmationStatus}`}>
                    {event.confirmationStatus === "confirmed" ? "확정" : "미확정"}
                  </span>
                </div>
              ))}
              {events.length > previewEvents.length && (
                <p className="event-preview-more" aria-label={`추가 학업 이벤트 ${events.length - previewEvents.length}개`}>•••</p>
              )}
            </div>
          </Link>
        </section>
      )}
      <footer className="upload-developer-tools">
        <button type="button" onClick={() => resetCatchUpPrototype()}>초기화</button>
      </footer>
    </section>
  );
}
