import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../../domain/types";
import type { MonthScheduleItem } from "./monthSelectors";

export type MonthEventDraft = Pick<
  CalendarEvent,
  "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType"
>;

interface Draft {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  eventType: CalendarEvent["eventType"];
}

interface Props {
  selectedDate: string;
  schedules: readonly MonthScheduleItem[];
  eventsById: Readonly<Record<string, CalendarEvent>>;
  onClose: () => void;
  onSave: (draft: MonthEventDraft, eventId?: string) => void;
  onDelete: (eventId: string) => void;
}

function emptyDraft(date: string): Draft {
  return {
    title: "",
    date,
    startTime: "09:00",
    endTime: "10:00",
    eventType: "personal",
  };
}

function displayTime(item: MonthScheduleItem) {
  if (!item.startTime) return "종일";
  return item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
}

export function MonthScheduleDialog({
  selectedDate,
  schedules,
  eventsById,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState(() => emptyDraft(selectedDate));
  const [error, setError] = useState("");
  const [, month, day] = selectedDate.split("-").map(Number);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  useEffect(() => {
    setEditingId(undefined);
    setDraft(emptyDraft(selectedDate));
    setError("");
  }, [selectedDate]);

  const edit = (eventId: string) => {
    const event = eventsById[eventId];
    if (!event) return;
    setEditingId(eventId);
    setDraft({
      title: event.title,
      date: event.date,
      startTime: event.startTime ?? "09:00",
      endTime: event.endTime ?? "10:00",
      eventType: event.eventType,
    });
    setError("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("일정 제목을 입력해주세요.");
      return;
    }
    if (draft.endTime <= draft.startTime) {
      setError("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }
    onSave(
      {
        ...draft,
        title: draft.title.trim(),
        isAllDay: false,
      },
      editingId,
    );
    setEditingId(undefined);
    setDraft(emptyDraft(draft.date));
    setError("");
  };

  return (
    <dialog
      ref={dialogRef}
      className="month-sheet-dialog"
      aria-labelledby="month-sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="month-sheet">
        <div className="month-sheet__handle" aria-hidden="true" />
        <header className="month-sheet__header">
          <h2 id="month-sheet-title">{month}월 {day}일 일정</h2>
          <button type="button" onClick={onClose} aria-label="일정 상세 닫기">×</button>
        </header>

        {schedules.length === 0 ? (
          <p className="month-sheet__empty">아직 등록된 일정이 없어요.</p>
        ) : (
          <ul className="month-schedule-list">
            {schedules.map((item) => (
              <li key={item.id}>
                <span className="month-schedule-list__flag" aria-hidden="true">⚑</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{displayTime(item)}</span>
                </div>
                {item.eventId && (
                  <div className="month-schedule-list__actions">
                    <button type="button" onClick={() => edit(item.eventId!)} aria-label={`${item.title} 수정`}>✎</button>
                    {item.source === "catchup" && (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(item.eventId!);
                          if (editingId === item.eventId) {
                            setEditingId(undefined);
                            setDraft(emptyDraft(selectedDate));
                          }
                        }}
                        aria-label={`${item.title} 삭제`}
                      >
                        ♲
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="month-schedule-form" onSubmit={submit}>
          <h3>{editingId ? "일정 수정" : "일정 추가"}</h3>
          <label>
            <span>제목</span>
            <input
              value={draft.title}
              placeholder="일정 제목을 입력하세요"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            <span>날짜</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </label>
          <label>
            <span>시작 시간</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
            />
          </label>
          <label>
            <span>종료 시간</span>
            <input
              type="time"
              value={draft.endTime}
              onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
            />
          </label>
          <label>
            <span>과목/캘린더</span>
            <select
              value={
                editingId && eventsById[editingId]?.source === "google-calendar"
                  ? "google"
                  : "catchup"
              }
              disabled
            >
              <option value="catchup">CatchUp 개인 일정</option>
              <option value="google">Google Calendar</option>
            </select>
          </label>
          <label>
            <span>유형</span>
            <select
              value={draft.eventType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  eventType: event.target.value as CalendarEvent["eventType"],
                })
              }
            >
              <option value="personal">개인 일정</option>
              <option value="class">수업 일정</option>
            </select>
          </label>
          {error && <p className="month-schedule-form__error" role="alert">{error}</p>}
          <div className="month-schedule-form__buttons">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(undefined);
                  setDraft(emptyDraft(selectedDate));
                  setError("");
                }}
              >
                취소
              </button>
            )}
            <button type="submit">저장</button>
          </div>
        </form>
      </section>
    </dialog>
  );
}
