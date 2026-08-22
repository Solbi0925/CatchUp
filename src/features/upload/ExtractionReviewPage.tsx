import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { selectAllExtractedItems } from "../../domain/selectors";
import type { ExtractedItem } from "../../domain/types";
import {
  assessAcademicEventConfirmation,
} from "../../domain/academicEventStatus";
import { mergeUserSelectedAcademicEvents, splitAcademicEventBySources } from "../../domain/mergeAcademicEvents";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { AcademicEventEditor, eventTypeLabels, weekdayOptions } from "./AcademicEventEditor";
import "./upload.css";

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

const dayInMilliseconds = 24 * 60 * 60 * 1_000;

function validIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function sourceWeek(item: ExtractedItem) {
  if (item.scheduledWeek !== null) return item.scheduledWeek;
  const match = item.scheduledWeekLabel?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function courseWeekOneStart(items: ExtractedItem[], fallback: string | null) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (validIsoDate(item.weekOneStartDate)) {
      counts.set(item.weekOneStartDate, (counts.get(item.weekOneStartDate) ?? 0) + 1);
    }
  });
  return [...counts.entries()].sort(([leftDate, leftCount], [rightDate, rightCount]) =>
    rightCount - leftCount || leftDate.localeCompare(rightDate))[0]?.[0]
    ?? (validIsoDate(fallback) ? fallback : null);
}

function reviewOrderKey(item: ExtractedItem, weekOneStart: string | null) {
  const week = sourceWeek(item);
  if (item.date && weekOneStart && validIsoDate(item.date)) {
    const position = (Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${weekOneStart}T00:00:00Z`)) / dayInMilliseconds;
    return { group: 0, position, kind: 1, date: item.date };
  }
  if (week !== null) {
    return { group: 0, position: (week - 1) * 7, kind: item.date ? 1 : 0, date: item.date ?? "" };
  }
  if (item.date) return { group: 1, position: 0, kind: 0, date: item.date };
  return { group: 2, position: 0, kind: 0, date: "" };
}

export function sortAcademicEventsForReview(items: ExtractedItem[], semesterWeekOneStartDate: string | null) {
  const weekOneStart = courseWeekOneStart(items, semesterWeekOneStartDate);
  return [...items].sort((left, right) => {
    const leftKey = reviewOrderKey(left, weekOneStart);
    const rightKey = reviewOrderKey(right, weekOneStart);
    return leftKey.group - rightKey.group
      || leftKey.position - rightKey.position
      || leftKey.kind - rightKey.kind
      || leftKey.date.localeCompare(rightKey.date)
      || left.title.localeCompare(right.title, "ko");
  });
}

export function ExtractionReviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch } = usePrototypeStore();
  const items = selectAllExtractedItems(state);
  const [draft, setDraft] = useState<ExtractedItem[]>(() => items.map((item) => ({ ...item })));
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeMode, setMergeMode] = useState(false);
  const [showMergeHelp, setShowMergeHelp] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | undefined>(() => searchParams.get("course") ?? undefined);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(items), [draft, items]);
  const courses = useMemo(() => [...new Set(draft.map((item) => item.courseName || "과목 확인 필요"))]
    .sort((left, right) => {
      const unread = (course: string) => draft.some((item) => (item.courseName || "과목 확인 필요") === course && item.updateNoticeStatus === "unread");
      return Number(unread(right)) - Number(unread(left)) || left.localeCompare(right, "ko");
    }), [draft]);
  const visibleItems = useMemo(() => sortAcademicEventsForReview(
    draft.filter((item) => (item.courseName || "과목 확인 필요") === selectedCourse),
    state.planningProfile.semesterWeekOneStartDate,
  ), [draft, selectedCourse, state.planningProfile.semesterWeekOneStartDate]);

  function updateItem(id: string, patch: Partial<ExtractedItem>) {
    setDraft((current) => current.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, ...patch };
      return { ...updated, ...assessAcademicEventConfirmation(updated) };
    }));
  }


  function save() {
    const nextErrors: Record<string, string> = {};
    draft.forEach((item) => {
      if (!item.title.trim()) nextErrors[`${item.id}-title`] = "이벤트명을 입력해 주세요.";
      if (!item.courseName.trim()) nextErrors[`${item.id}-course`] = "과목명을 입력해 주세요.";
      if (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) nextErrors[`${item.id}-date`] = "올바른 날짜를 입력해 주세요.";
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
    if (!window.confirm(`원본 자료 ${split.length}개를 기준으로 이벤트를 분리할까요? 분리 후 각 내용을 직접 확인해 주세요.`)) return;
    setDraft((current) => current.flatMap((candidate) => candidate.id === item.id ? split : candidate));
    setExpandedId(undefined);
  }

  function goBack() {
    if (!isDirty || window.confirm("저장하지 않은 변경사항이 있어요. 나갈까요?")) navigate("/upload");
  }

  function selectCourse(course: string) {
    setSelectedCourse(course);
    setExpandedId(undefined);
    setSelectedIds([]);
    navigate(`/upload/extraction?course=${encodeURIComponent(course)}`, { replace: true });
  }

  function showCourseList() {
    setSelectedCourse(undefined);
    setExpandedId(undefined);
    setSelectedIds([]);
    navigate("/upload/extraction", { replace: true });
  }

  if (!items.length) return <main className="focus-page"><h1>분석된 학업 이벤트가 없어요</h1><button type="button" className="primary-button" onClick={() => navigate("/upload")}>Upload로 돌아가기</button></main>;

  return (
    <main className="focus-page extraction-review-page">
      <header className="focus-header"><button type="button" className="back-button" aria-label="Upload로 돌아가기" onClick={goBack}>‹</button><div><h1>학업 이벤트 확인 및 수정</h1><p>파일이 아닌 최종 과제·시험 단위로 확인하세요.</p></div></header>
      <div className="review-summary-row">
        <p className="review-summary">이벤트 {draft.length}개 · 확정 {draft.filter((item) => item.confirmationStatus === "confirmed").length}개 · 미확정 {draft.filter((item) => item.confirmationStatus === "unconfirmed").length}개</p>
        <div className={`merge-help${showMergeHelp ? " is-open" : ""}`}>
          <button type="button" className="merge-help__button" aria-label="이벤트 병합 도움말" aria-expanded={showMergeHelp} aria-controls="merge-help-tooltip" aria-describedby="merge-help-tooltip" onClick={() => setShowMergeHelp((current) => !current)}>?</button>
          <div className="merge-help__tooltip" id="merge-help-tooltip" role="tooltip">
            <h2>이벤트 병합이란 무엇인가요?</h2>
            <p>AI 추출, 분석 과정에서 학업 이벤트가 두 개 이상의 학업 이벤트로 잘못 분리된 경우, 해당 이벤트를 선택하여 하나로 합칠 수 있어요</p>
          </div>
        </div>
      </div>
      <div className="event-correction-toolbar">
        <span>{mergeMode ? "병합할 같은 이벤트를 선택하세요." : "과목별로 추출 결과를 확인하세요."}</span>
        <button type="button" onClick={() => { setMergeMode((current) => !current); setSelectedIds([]); }}>{mergeMode ? "병합 취소" : "이벤트 병합"}</button>
        {mergeMode && <button type="button" disabled={selectedIds.length < 2} onClick={mergeSelected}>선택 이벤트 병합 ({selectedIds.length})</button>}
      </div>
      <div className="extraction-list">
        {!selectedCourse ? courses.map((course) => {
          const courseItems = draft.filter((item) => (item.courseName || "과목 확인 필요") === course);
          const hasUnread = courseItems.some((item) => item.updateNoticeStatus === "unread");
          return <button type="button" className="extraction-course-card" key={course} aria-label={`${course} 학업 이벤트 ${courseItems.length}개`} onClick={() => selectCourse(course)}>
            <span><strong>{course}{hasUnread && <span className="update-notice-dot" aria-label="새 업데이트" />}</strong><small>학업 이벤트 {courseItems.length}개</small></span>
            <span aria-hidden="true">›</span>
          </button>;
        }) : <>
          <button type="button" className="extraction-course-back" onClick={showCourseList}>‹ 과목 목록</button>
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
                <AcademicEventEditor item={item} errors={errors} onChange={(patch) => updateItem(item.id, patch)} onSplit={() => splitItem(item)} onDelete={() => deleteItem(item)} />
              )}
            </section>
          );
        })}</>}
      </div>
      <div className="focus-actions"><button type="button" className="primary-button" onClick={save}>학업 이벤트 저장</button></div>
    </main>
  );
}
