import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../../domain/types";
import {
  CALENDAR_CATEGORY_COLORS,
  type CalendarCategoryColor,
} from "./calendarColors";
import "./scheduleEditor.css";

export type ScheduleDisplayType = "deadline" | "submission" | "exam" | "notice" | "class" | "personal";
export type ScheduleDraft = Omit<Pick<
  CalendarEvent,
  "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType"
>, "eventType"> & { eventType: ScheduleDisplayType };

const fixedTypeLabels: Record<ScheduleDisplayType, string> = {
  deadline: "학업 마감", submission: "학업 제출", exam: "시험", notice: "중요 공지", class: "수업 일정", personal: "개인 일정",
};

interface Props {
  draftIdentity: string;
  initialDraft: ScheduleDraft;
  categoryKind: "course" | "personal";
  categoryColor: CalendarCategoryColor;
  onSave: (draft: ScheduleDraft) => void;
  onColorChange: (color: CalendarCategoryColor) => void;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}

export function ScheduleEditorDialog({
  draftIdentity,
  initialDraft,
  categoryKind,
  categoryColor,
  onSave,
  onColorChange,
  onClose,
  onDelete,
  deleteLabel = "일정 삭제",
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  const latestInitialDraft = useRef(initialDraft);
  latestInitialDraft.current = initialDraft;

  useEffect(() => {
    setDraft(latestInitialDraft.current);
    setError("");
  }, [draftIdentity]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("일정 제목을 입력해주세요.");
      return;
    }
    if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime) {
      setError("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }
    onSave({ ...draft, title: draft.title.trim() });
  };

  return (
    <section className="schedule-editor" role="dialog" aria-label="일정 편집">
      <header>
        <h3>일정 편집</h3>
        <button type="button" onClick={onClose} aria-label="일정 편집 닫기">×</button>
      </header>
      <form onSubmit={submit}>
        <label>
          <span>제목</span>
          <input
            aria-label="제목"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          <span>날짜</span>
          <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        </label>
        <div className="schedule-editor__times">
          <label><span>시작</span><input type="time" value={draft.startTime ?? ""} onChange={(event) => setDraft({ ...draft, startTime: event.target.value || null })} /></label>
          <label><span>종료</span><input type="time" value={draft.endTime ?? ""} onChange={(event) => setDraft({ ...draft, endTime: event.target.value || null })} /></label>
        </div>
        <p className="schedule-editor__fixed-type">{fixedTypeLabels[draft.eventType]}</p>
        <fieldset className="schedule-color-fieldset">
          <legend>색상</legend>
          <div>
            {CALENDAR_CATEGORY_COLORS.map((color, index) => (
              <label key={color} style={{ "--swatch": color } as React.CSSProperties}>
                <input type="radio" name="schedule-color" aria-label={`색상 ${index + 1}`} checked={categoryColor === color} onChange={() => onColorChange(color)} />
                <span aria-hidden="true" />
              </label>
            ))}
          </div>
          <p>{categoryKind === "course" ? "같은 과목의 모든 일정에 적용돼요." : "모든 개인 일정에 적용돼요."}</p>
        </fieldset>
        {error && <p className="schedule-editor__error" role="alert">{error}</p>}
        <button className="schedule-editor__primary" type="submit">저장</button>
        {onDelete && <button className="schedule-editor__delete" type="button" onClick={onDelete}>{deleteLabel}</button>}
      </form>
    </section>
  );
}
