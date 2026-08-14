import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { selectAllExtractedItems } from "../../domain/selectors";
import type { ClassMeetingTime, ExtractedItem } from "../../domain/types";
import {
  academicEventConfirmationIssueLabels,
  assessAcademicEventConfirmation,
} from "../../domain/academicEventStatus";
import { mergeUserSelectedAcademicEvents, splitAcademicEventBySources } from "../../domain/mergeAcademicEvents";
import { usePrototypeStore } from "../../store/PrototypeStore";
import "./upload.css";

const eventTypeLabels: Record<ExtractedItem["itemType"], string> = {
  assignment: "과제", exam: "시험", "team-project": "팀 프로젝트", presentation: "발표",
  quiz: "퀴즈", deadline: "마감", submission: "제출", notice: "공지",
  "class-schedule": "수업 일정", other: "기타",
};
const assignmentTypeLabels = {
  "problem-set": "문제풀이", coding: "코딩", report: "보고서", essay: "에세이",
  presentation: "발표", "team-project": "팀 프로젝트", other: "기타",
};
const weekdayOptions: Array<{ value: ClassMeetingTime["weekday"]; label: string }> = [
  { value: 1, label: "월요일" }, { value: 2, label: "화요일" },
  { value: 3, label: "수요일" }, { value: 4, label: "목요일" },
  { value: 5, label: "금요일" }, { value: 6, label: "토요일" },
  { value: 0, label: "일요일" },
];

function nullable(value: string) { return value.trim() || null; }

function displayFileName(fileName: string) {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function eventTimingLabel(item: ExtractedItem) {
  if (item.date) return item.date;
  if (item.scheduledWeekLabel) return item.scheduledWeekLabel;
  if (item.itemType === "class-schedule" && item.classMeetingTimes.length > 0) {
    const first = item.classMeetingTimes[0];
    const weekday = weekdayOptions.find((option) => option.value === first.weekday)?.label ?? "요일 확인 필요";
    const remaining = item.classMeetingTimes.length - 1;
    return `${weekday} ${first.startTime}–${first.endTime}${remaining > 0 ? ` 외 ${remaining}회` : ""}`;
  }
  return "날짜 확인 필요";
}

export function ExtractionReviewPage() {
  const navigate = useNavigate();
  const { state, dispatch } = usePrototypeStore();
  const items = selectAllExtractedItems(state);
  const [draft, setDraft] = useState<ExtractedItem[]>(() => items.map((item) => ({ ...item })));
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string>();
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(items), [draft, items]);
  const courses = useMemo(() => [...new Set(draft.map((item) => item.courseName || "과목 확인 필요"))]
    .sort((left, right) => {
      const unread = (course: string) => draft.some((item) => (item.courseName || "과목 확인 필요") === course && item.updateNoticeStatus === "unread");
      return Number(unread(right)) - Number(unread(left)) || left.localeCompare(right, "ko");
    }), [draft]);
  const visibleItems = useMemo(() => draft
    .filter((item) => (item.courseName || "과목 확인 필요") === selectedCourse)
    .sort((left, right) => {
      const precision = (item: ExtractedItem) => item.date ? 0 : item.scheduledWeek !== null ? 1 : 2;
      return precision(left) - precision(right)
        || (left.date ?? String(left.scheduledWeek ?? 999)).localeCompare(right.date ?? String(right.scheduledWeek ?? 999));
    }), [draft, selectedCourse]);

  function updateItem(id: string, patch: Partial<ExtractedItem>) {
    setDraft((current) => current.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, ...patch };
      return { ...updated, ...assessAcademicEventConfirmation(updated) };
    }));
  }

  function updateClassMeeting(
    itemId: string,
    meetingId: string,
    patch: Partial<ClassMeetingTime>,
  ) {
    const item = draft.find((candidate) => candidate.id === itemId);
    if (!item) return;
    updateItem(itemId, {
      classMeetingTimes: item.classMeetingTimes.map((meeting) =>
        meeting.id === meetingId ? { ...meeting, ...patch } : meeting),
    });
  }

  function save() {
    const nextErrors: Record<string, string> = {};
    draft.forEach((item) => {
      if (!item.title.trim()) nextErrors[`${item.id}-title`] = "이벤트명을 입력해주세요.";
      if (!item.courseName.trim()) nextErrors[`${item.id}-course`] = "과목명을 입력해주세요.";
      if (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) nextErrors[`${item.id}-date`] = "올바른 날짜를 입력해주세요.";
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setExpandedId(Object.keys(nextErrors)[0].split("-").slice(0, -1).join("-"));
      return;
    }
    dispatch({
      type: "extraction/confirmed",
      payload: { deletedItemIds: items.filter((item) => !draft.some((candidate) => candidate.id === item.id)).map((item) => item.id), items: draft.map((item) => {
        const original = items.find((candidate) => candidate.id === item.id);
        return {
          ...item,
          isUserEdited: item.isUserEdited || JSON.stringify(item) !== JSON.stringify(original),
        };
      }) },
    });
    navigate("/upload");
  }

  function deleteItem(item: ExtractedItem) {
    if (!window.confirm(`"${item.title || "이름 없는 이벤트"}" 학업 이벤트를 삭제할까요?`)) return;
    setDraft((current) => current.filter((candidate) => candidate.id !== item.id));
    setExpandedId((current) => current === item.id ? undefined : current);
    setErrors((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${item.id}-`)),
    ));
  }

  function mergeSelected() {
    const selected = draft.filter((item) => selectedIds.includes(item.id));
    if (selected.length < 2) return;
    if (!window.confirm(`선택한 ${selected.length}개 이벤트를 하나로 병합할까요?`)) return;
    const merged = mergeUserSelectedAcademicEvents(selected);
    setDraft((current) => [merged, ...current.filter((item) => !selectedIds.includes(item.id))]);
    setSelectedIds([]);
    setExpandedId(merged.id);
  }

  function splitItem(item: ExtractedItem) {
    const split = splitAcademicEventBySources(item);
    if (!split.length) return;
    if (!window.confirm(`원본 자료 ${split.length}개를 기준으로 이벤트를 분리할까요? 분리 후 각 내용을 직접 확인해주세요.`)) return;
    setDraft((current) => current.flatMap((candidate) => candidate.id === item.id ? split : candidate));
    setExpandedId(undefined);
  }

  function goBack() {
    if (!isDirty || window.confirm("저장하지 않은 변경사항이 있어요. 나갈까요?")) navigate("/upload");
  }

  if (!items.length) return <main className="focus-page"><h1>분석된 학업 이벤트가 없어요</h1><button type="button" className="primary-button" onClick={() => navigate("/upload")}>Upload로 돌아가기</button></main>;

  return (
    <main className="focus-page extraction-review-page">
      <header className="focus-header"><button type="button" className="back-button" aria-label="Upload로 돌아가기" onClick={goBack}>‹</button><div><h1>학업 이벤트 확인 및 수정</h1><p>파일이 아닌 최종 과제·시험 단위로 확인하세요.</p></div></header>
      <p className="review-summary">이벤트 {draft.length}개 · 확정 {draft.filter((item) => item.confirmationStatus === "confirmed").length}개 · 미확정 {draft.filter((item) => item.confirmationStatus === "unconfirmed").length}개</p>
      <div className="event-correction-toolbar">
        <span>{mergeMode ? "병합할 같은 이벤트를 선택하세요." : "과목별로 추출 결과를 확인하세요."}</span>
        <button type="button" onClick={() => { setMergeMode((current) => !current); setSelectedIds([]); }}>{mergeMode ? "병합 취소" : "이벤트 병합"}</button>
        {mergeMode && <button type="button" disabled={selectedIds.length < 2} onClick={mergeSelected}>선택 이벤트 병합 ({selectedIds.length})</button>}
      </div>
      <div className="extraction-list">
        {!selectedCourse ? courses.map((course) => {
          const courseItems = draft.filter((item) => (item.courseName || "과목 확인 필요") === course);
          const hasUnread = courseItems.some((item) => item.updateNoticeStatus === "unread");
          return <button type="button" className="extraction-course-card" key={course} onClick={() => setSelectedCourse(course)}>
            <span><strong>{course}</strong><small>학업 이벤트 {courseItems.length}개</small></span>
            {hasUnread && <span className="update-notice-dot" aria-label="새 업데이트" />}
            <span aria-hidden="true">›</span>
          </button>;
        }) : <>
          <button type="button" className="extraction-course-back" onClick={() => { setSelectedCourse(undefined); setExpandedId(undefined); setSelectedIds([]); }}>‹ 과목 목록</button>
          <h2 className="extraction-course-title">{selectedCourse}</h2>
        {visibleItems.map((item) => {
          const expanded = expandedId === item.id;
          const hasError = Object.keys(errors).some((key) => key.startsWith(item.id));
          return (
            <section className="extraction-item" key={item.id}>
              {mergeMode && <label className="extraction-item__select"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>병합 선택</span></label>}
              <button type="button" className="extraction-item__toggle" aria-expanded={expanded} onClick={() => {
                dispatch({ type: "extraction/updateReviewed", payload: { id: item.id } });
                setDraft((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, updateNoticeStatus: "reviewed" } : candidate));
                setExpandedId(expanded ? undefined : item.id);
              }}>
                <span><strong>{item.title || "이름 없는 이벤트"}{item.updateNoticeStatus === "unread" && <span className="update-notice-dot" aria-label="새 업데이트" />}</strong><small>{item.courseName || "과목 확인 필요"} · {eventTypeLabels[item.itemType]} · {eventTimingLabel(item)}</small></span>
                <span className={hasError ? "status-badge status-badge--error" : `status-badge status-badge--${item.confirmationStatus}`}>{hasError ? "입력 확인" : item.confirmationStatus === "confirmed" ? "확정" : "미확정"}</span>
              </button>
              {expanded && (
                <div className="extraction-item__fields">
                  {item.uncertaintyNotes.length > 0 && <aside className="uncertainty-box"><strong>AI 확인 메모</strong>{item.uncertaintyNotes.map((note) => <p key={note}>{note}</p>)}</aside>}
                  {item.confirmationIssues.length > 0 && <aside className="confirmation-box"><strong>확정하려면 필요한 정보</strong><p>{item.confirmationIssues.map((issue) => academicEventConfirmationIssueLabels[issue]).join(", ")}</p></aside>}
                  <div className="field-row"><label>이벤트명<input aria-label="이벤트명" value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />{errors[`${item.id}-title`] && <span className="field-error">{errors[`${item.id}-title`]}</span>}</label><label>과목<input aria-label="과목" value={item.courseName} onChange={(event) => updateItem(item.id, { courseName: event.target.value })} />{errors[`${item.id}-course`] && <span className="field-error">{errors[`${item.id}-course`]}</span>}</label></div>
                  <div className="field-row"><label>이벤트 유형<select aria-label="이벤트 유형" value={item.itemType} onChange={(event) => updateItem(item.id, { itemType: event.target.value as ExtractedItem["itemType"] })}>{Object.entries(eventTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>과목 코드<input value={item.courseCode ?? ""} onChange={(event) => updateItem(item.id, { courseCode: nullable(event.target.value) })} placeholder="정보 없음" /></label></div>
                  {item.itemType !== "class-schedule" && <div className="field-row"><label>날짜 / 마감일<input aria-label="날짜 / 마감일" type="date" value={item.date ?? ""} onChange={(event) => updateItem(item.id, { date: nullable(event.target.value) })} />{errors[`${item.id}-date`] && <span className="field-error">{errors[`${item.id}-date`]}</span>}</label><label>시간<input type="time" value={item.time ?? ""} onChange={(event) => updateItem(item.id, { time: nullable(event.target.value) })} /></label></div>}
                  {item.itemType !== "class-schedule" && <><div className="field-row"><label>예정 주차<input aria-label="예정 주차" type="number" min="1" value={item.scheduledWeek ?? ""} onChange={(event) => updateItem(item.id, { scheduledWeek: event.target.value ? Number(event.target.value) : null })} placeholder="예: 8" /></label><label>자료의 주차 표기<input aria-label="자료의 주차 표기" value={item.scheduledWeekLabel ?? ""} onChange={(event) => updateItem(item.id, { scheduledWeekLabel: nullable(event.target.value) })} placeholder="예: 8주차, Week 8" /></label></div><label>1주차 시작일<input aria-label="1주차 시작일" type="date" value={item.weekOneStartDate ?? ""} onChange={(event) => updateItem(item.id, { weekOneStartDate: nullable(event.target.value) })} /><small>자료에 날짜 근거가 있을 때만 입력하세요. 없으면 AI Mate가 최초 계획 생성 시 확인합니다.</small></label></>}
                  {item.itemType === "class-schedule" && <section className="class-meeting-editor"><div className="class-meeting-editor__heading"><h3>수업 시간</h3><button type="button" onClick={() => updateItem(item.id, { classMeetingTimes: [...item.classMeetingTimes, { id: `meeting-${item.id}-${Date.now()}`, weekday: 1, startTime: "09:00", endTime: "10:00", location: null }] })}>수업 시간 추가</button></div>{item.classMeetingTimes.map((meeting, index) => <article className="class-meeting-row" key={meeting.id}><div className="field-row"><label>요일<select aria-label={`수업 ${index + 1} 요일`} value={meeting.weekday} onChange={(event) => updateClassMeeting(item.id, meeting.id, { weekday: Number(event.target.value) as ClassMeetingTime["weekday"] })}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>강의실<input aria-label={`수업 ${index + 1} 강의실`} value={meeting.location ?? ""} onChange={(event) => updateClassMeeting(item.id, meeting.id, { location: nullable(event.target.value) })} placeholder="정보 없음" /></label></div><div className="field-row"><label>시작 시간<input aria-label={`수업 ${index + 1} 시작 시간`} type="time" value={meeting.startTime} onChange={(event) => updateClassMeeting(item.id, meeting.id, { startTime: event.target.value })} /></label><label>종료 시간<input aria-label={`수업 ${index + 1} 종료 시간`} type="time" value={meeting.endTime} onChange={(event) => updateClassMeeting(item.id, meeting.id, { endTime: event.target.value })} /></label></div><button type="button" className="class-meeting-remove" onClick={() => updateItem(item.id, { classMeetingTimes: item.classMeetingTimes.filter((candidate) => candidate.id !== meeting.id) })}>이 수업 시간 삭제</button></article>)}</section>}
                  {(item.itemType === "assignment" || item.itemType === "team-project" || item.itemType === "presentation") && <label>과제 유형<select value={item.assignmentType ?? ""} onChange={(event) => updateItem(item.id, { assignmentType: (event.target.value || null) as ExtractedItem["assignmentType"] })}><option value="">정보 없음</option>{Object.entries(assignmentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                  {(item.itemType === "exam" || item.itemType === "quiz") && <><label>시험 유형<input value={item.examType ?? ""} onChange={(event) => updateItem(item.id, { examType: nullable(event.target.value) })} placeholder="예: 중간고사, 오픈북" /></label><label>시험 범위<textarea value={item.examScope ?? ""} onChange={(event) => updateItem(item.id, { examScope: nullable(event.target.value) })} /></label><label>평가 방식<input value={item.gradingMethod ?? ""} onChange={(event) => updateItem(item.id, { gradingMethod: nullable(event.target.value) })} placeholder="예: 점수제" /></label></>}
                  {item.itemType !== "class-schedule" && <>
                    <label>분량<input value={item.workload ?? ""} onChange={(event) => updateItem(item.id, { workload: nullable(event.target.value) })} placeholder="정보 없음" /></label>
                    <label>요구사항<textarea value={item.requirements ?? ""} onChange={(event) => updateItem(item.id, { requirements: nullable(event.target.value) })} placeholder="정보 없음" /></label>
                    <label>제출 방식<input aria-label="제출 방식" value={item.submissionMethod ?? ""} onChange={(event) => updateItem(item.id, { submissionMethod: nullable(event.target.value) })} placeholder="예: LMS 과제함" /></label>
                    <div className="field-row"><label>자료 조사량<select value={item.researchNeeded} onChange={(event) => updateItem(item.id, { researchNeeded: event.target.value as ExtractedItem["researchNeeded"] })}><option value="unknown">확인 필요</option><option value="none">없음</option><option value="low">적음</option><option value="medium">보통</option><option value="high">많음</option></select></label><label>객관적 난이도<select value={item.difficulty} onChange={(event) => updateItem(item.id, { difficulty: event.target.value as ExtractedItem["difficulty"] })}><option value="unknown">확인 필요</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option></select></label></div>
                    <label>결과물 복잡도<input value={item.deliverableComplexity ?? ""} onChange={(event) => updateItem(item.id, { deliverableComplexity: nullable(event.target.value) })} placeholder="정보 없음" /></label>
                  </>}
                  <section className="source-reference-list"><h3>통합에 사용된 원본 자료</h3>{item.sourceReferences.map((source) => <article key={source.id}><strong title={displayFileName(source.fileName)}>{displayFileName(source.fileName)}</strong><span>{source.evidence ?? "구체적 근거 위치 확인 필요"}</span></article>)}</section>
                  {item.sourceReferences.length > 1 && <button type="button" className="extraction-item-split" onClick={() => splitItem(item)}>원본 자료 기준으로 이벤트 분리</button>}
                  <button type="button" className="extraction-item-delete" onClick={() => deleteItem(item)}>이 학업 이벤트 삭제</button>
                </div>
              )}
            </section>
          );
        })}</>}
      </div>
      <div className="focus-actions"><button type="button" className="primary-button" onClick={save}>학업 이벤트 저장</button></div>
    </main>
  );
}
