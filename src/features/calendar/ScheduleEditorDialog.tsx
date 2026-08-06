import { type FormEvent, useEffect, useState } from "react";
import type { CalendarEvent } from "../../domain/types";
import {
  CALENDAR_CATEGORY_COLORS,
  type CalendarCategoryColor,
} from "./calendarColors";
import "./scheduleEditor.css";

export type ScheduleDraft = Pick<
  CalendarEvent,
  "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType"
>;

interface Props {
  initialDraft: ScheduleDraft;
  categoryKind: "course" | "personal";
  categoryColor: CalendarCategoryColor;
  onSave: (draft: ScheduleDraft) => void;
  onColorChange: (color: CalendarCategoryColor) => void;
  onClose: () => void;
}

export function ScheduleEditorDialog({
  initialDraft,
  categoryKind,
  categoryColor,
  onSave,
  onColorChange,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(initialDraft);
    setError("");
  }, [initialDraft]);

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
        <label>
          <span>유형</span>
          <select value={draft.eventType} onChange={(event) => setDraft({ ...draft, eventType: event.target.value as CalendarEvent["eventType"] })}>
            <option value="personal">개인 일정</option>
            <option value="class">수업 일정</option>
          </select>
        </label>
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
      </form>
    </section>
  );
}
