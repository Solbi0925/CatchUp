import { useState } from "react";
import { Link } from "react-router-dom";
import { isSupportedAcademicFile } from "../../domain/policies";
import { selectAllExtractedItems } from "../../domain/selectors";
import type { UploadedDocument } from "../../domain/types";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { resetCatchUpPrototype } from "../../store/resetPrototype";
import { ChevronRightIcon, UploadCloudIcon } from "../../ui/icons";
import { useUploadSession } from "./UploadSessionProvider";
import { sortUploadFiles } from "./uploadReducer";
import "./upload.css";

function FileTypeIcon({ format }: { format: UploadedDocument["supportedFileFormat"] }) {
  return <div className="file-type-icon">{format === "pdf" ? "PDF" : "IMG"}</div>;
}

function compactFileName(fileName: string) {
  const characters = Array.from(fileName);
  return characters.length <= 20 ? fileName : `${characters.slice(0, 20).join("")}…`;
}

const fileStatusLabels = { pending: "대기", extracting: "추출중", complete: "추출 완료", failed: "추출 실패" } as const;

export function UploadPage() {
  const { state: store } = usePrototypeStore();
  const { uiState, dispatch, analyze } = useUploadSession();
  const [showHelp, setShowHelp] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const events = selectAllExtractedItems(store);
  const courses = [...new Set(events.map((event) => event.courseName || "과목 확인 필요"))]
    .sort((left, right) => {
      const hasUnread = (course: string) => events.some((event) =>
        (event.courseName || "과목 확인 필요") === course && event.updateNoticeStatus === "unread");
      return Number(hasUnread(right)) - Number(hasUnread(left)) || left.localeCompare(right, "ko");
    });
  const previewCourses = courses.slice(0, 4);

  function addFiles(selected: File[]) {
    const invalid = selected.filter((file) => !isSupportedAcademicFile(file));
    const valid = selected.filter(isSupportedAcademicFile);
    if (valid.length) dispatch({ type: "files/added", files: valid });
    if (invalid.length) dispatch({ type: "files/invalid", message: "PDF 또는 이미지 파일만 추가할 수 있어요." });
  }

  const extracting = uiState.status === "extracting";
  const pendingCount = uiState.files.filter((entry) => entry.status === "pending" || entry.status === "failed").length;
  const extractingCount = uiState.files.filter((entry) => entry.status === "extracting").length;
  const completedCount = uiState.files.filter((entry) => entry.status === "complete").length;
  const sortedFiles = sortUploadFiles(uiState.files);
  const visibleFiles = showAllFiles ? sortedFiles : sortedFiles.slice(0, 3);
  return (
    <section className="upload-page">
      <header className="upload-header">
        <div><h1>자료 업로드</h1><p>여러 자료를 함께 분석해 과목과 이벤트별로 정리해요.</p></div>
        <button type="button" className="icon-button upload-help-button" aria-label="자료 업로드 도움말" onClick={() => setShowHelp(true)}>?</button>
      </header>

      <label className="upload-zone" htmlFor="academic-files">
        <UploadCloudIcon />
        <strong>이번학기 학업자료를 올려주세요</strong>
        <div className="upload-zone__examples" aria-label="업로드할 수 있는 학업 자료 예시">
          {["강의계획서", "과제 명세서", "시간표", "수업 공지", "시험 안내"].map((label) => <span key={label}>{label}</span>)}
        </div>
        <span className="upload-zone__support">새로운 학업자료나 정보가 생기면 언제든지 추가해주세요!</span>
      </label>
      <input id="academic-files" className="sr-only" type="file" multiple accept="application/pdf,image/*" aria-label="학업 자료 업로드" disabled={extracting} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />

      {showHelp && <div className="upload-help-backdrop" role="presentation" onMouseDown={() => setShowHelp(false)}>
        <section className="upload-help-card" role="dialog" aria-modal="true" aria-labelledby="upload-help-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><h2 id="upload-help-title">어떤 자료를 올릴 수 있나요?</h2><button type="button" aria-label="도움말 닫기" onClick={() => setShowHelp(false)}>×</button></header>
          <p>정식 문서가 아니어도 괜찮아요. 수업 공지, 이메일, 카카오톡 캡처처럼 학업 정보가 담긴 PDF나 이미지라면 추가할 수 있어요.</p>
          <ul><li>강의계획서와 과제 명세서</li><li>시간표와 시험 안내</li><li>LMS 공지, 교수님 이메일, 카카오톡 공지 캡처</li></ul>
          <p>학기 중 새로운 과제, 시험 안내, 공지가 생기면 언제든 추가로 올려주세요.</p>
          <p>기존 과제나 시험에 대한 추가 정보라면 기존 일정에 이어서 정리하고, 완전히 새로운 내용이라면 새 일정으로 추가해요.</p>
        </section>
      </div>}

      {uiState.status === "invalid" && <p className="inline-error">{uiState.message}</p>}
      {uiState.files.length > 0 && (
        <section className="selected-section">
          <div className="section-heading"><button type="button" className="selected-files-toggle" aria-expanded={showAllFiles} onClick={() => setShowAllFiles((current) => !current)}><h2>선택한 자료 <span>{uiState.files.length}</span></h2><ChevronRightIcon /></button><button type="button" className="text-button" disabled={extracting} onClick={() => dispatch({ type: "files/cleared" })}>전체 제거</button></div>
          <div className={`selected-file-list${showAllFiles ? " is-expanded" : ""}`}>
            {visibleFiles.map((entry) => (
              <div className="document-card" key={entry.id} title={entry.file.name}>
                <FileTypeIcon format={entry.file.type === "application/pdf" ? "pdf" : "image"} />
                <div className="document-card__text"><strong>{compactFileName(entry.file.name)}</strong></div>
                <span className={`file-extraction-status is-${entry.status}`}>{fileStatusLabels[entry.status]}</span>
                {!extracting && entry.status !== "complete" && <button className="remove-file" type="button" aria-label={`${entry.file.name} 제거`} onClick={() => dispatch({ type: "file/removed", id: entry.id })}>×</button>}
              </div>
            ))}
            {!showAllFiles && sortedFiles.length > visibleFiles.length && <button type="button" className="selected-files-more" onClick={() => setShowAllFiles(true)} aria-label={`추가 자료 ${sortedFiles.length - visibleFiles.length}개 보기`}>…</button>}
          </div>
          {uiState.status === "error" && <p className="inline-error">{uiState.message}</p>}
          {uiState.status === "ready" && uiState.result && (
            <div className="analysis-complete" role="status">
              <strong>추출 완료</strong>
              <span>{uiState.result.extractedItems.length}개의 학업 이벤트를 추출했어요. 아래에서 확인하고 수정할 수 있어요.</span>
            </div>
          )}
          <button type="button" className="primary-button analyze-batch-button" disabled={extracting || pendingCount === 0} onClick={analyze}>{extracting ? `${extractingCount}개 자료 통합 분석 중...` : pendingCount > 0 ? completedCount > 0 ? `${pendingCount}개 신규 자료 분석하기` : "모든 자료 통합 분석하기" : "모든 자료 추출 완료"}</button>
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
              {previewCourses.map((course) => {
                const courseEvents = events.filter((event) => (event.courseName || "과목 확인 필요") === course);
                const hasUnread = courseEvents.some((event) => event.updateNoticeStatus === "unread");
                return (
                  <div className="event-preview event-preview--course" key={course}>
                    <span><strong>{course}{hasUnread && <span className="update-notice-dot" aria-label="새 업데이트" />}</strong><small>학업 이벤트 {courseEvents.length}개</small></span>
                    <span className="event-preview-chevron" aria-hidden="true">›</span>
                  </div>
                );
              })}
              {courses.length > previewCourses.length && (
                <p className="event-preview-more" aria-label={`추가 과목 ${courses.length - previewCourses.length}개`}>•••</p>
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
