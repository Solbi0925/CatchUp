import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../../domain/types";
import { ScheduleEditorDialog, type ScheduleDraft } from "../calendar/ScheduleEditorDialog";
import { PERSONAL_CATEGORY_KEY, resolveCategoryColor, type CalendarCategoryColor } from "../calendar/calendarColors";
import type { MonthScheduleItem } from "./monthSelectors";

export type MonthEventDraft = ScheduleDraft;

interface Props {
  selectedDate: string;
  schedules: readonly MonthScheduleItem[];
  eventsById: Readonly<Record<string, CalendarEvent>>;
  categoryColorByKey: Readonly<Record<string, CalendarCategoryColor>>;
  onClose: () => void;
  onSave: (draft: MonthEventDraft, eventId?: string) => void;
  onDelete: (eventId: string) => void;
  onColorChange: (categoryKey: string, color: CalendarCategoryColor) => void;
}

function emptyDraft(date: string): ScheduleDraft {
  return { title: "", date, startTime: "09:00", endTime: "10:00", isAllDay: false, eventType: "personal" };
}

function displayTime(item: MonthScheduleItem) {
  if (!item.startTime) return "종일";
  return item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
}

export function MonthScheduleDialog({ selectedDate, schedules, eventsById, categoryColorByKey, onClose, onSave, onDelete, onColorChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedItem, setSelectedItem] = useState<MonthScheduleItem>();
  const [adding, setAdding] = useState(false);
  const [, month, day] = selectedDate.split("-").map(Number);

  useEffect(() => { dialogRef.current?.showModal(); return () => dialogRef.current?.close(); }, []);
  useEffect(() => { setSelectedItem(undefined); setAdding(false); }, [selectedDate]);

  const event = selectedItem?.eventId ? eventsById[selectedItem.eventId] : undefined;
  const draft = event ? {
    title: event.title, date: event.date, startTime: event.startTime, endTime: event.endTime, isAllDay: event.isAllDay, eventType: event.eventType,
  } : selectedItem ? {
    title: selectedItem.title, date: selectedItem.date, startTime: selectedItem.startTime, endTime: selectedItem.endTime, isAllDay: !selectedItem.startTime, eventType: selectedItem.eventType,
  } : emptyDraft(selectedDate);
  const categoryKey = selectedItem?.categoryKey ?? PERSONAL_CATEGORY_KEY;

  return (
    <dialog ref={dialogRef} className="month-sheet-dialog" aria-labelledby="month-sheet-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <section className="month-sheet">
        <div className="month-sheet__handle" aria-hidden="true" />
        <header className="month-sheet__header"><h2 id="month-sheet-title">{month}월 {day}일 일정</h2><button type="button" onClick={onClose} aria-label="일정 상세 닫기">×</button></header>

        {!selectedItem && !adding && <>
          {schedules.length === 0 ? <p className="month-sheet__empty">아직 등록된 일정이 없어요.</p> : (
            <ul className="month-schedule-list">
              {schedules.map((item) => <li key={item.id}>
                <button className="month-schedule-row" type="button" onClick={() => setSelectedItem(item)} aria-label={`${item.title} ${displayTime(item)} 선택`}>
                  <span className="month-schedule-list__flag" aria-hidden="true" style={{ backgroundColor: resolveCategoryColor(item.categoryKey, categoryColorByKey) }} />
                  <span><strong>{item.title}</strong><small>{displayTime(item)}</small></span>
                </button>
                {item.source === "catchup" && item.eventId && <button type="button" className="month-schedule-delete" onClick={() => onDelete(item.eventId!)} aria-label={`${item.title} 삭제`}>×</button>}
              </li>)}
            </ul>
          )}
          <button className="month-add-schedule" type="button" onClick={() => setAdding(true)}>일정 추가</button>
        </>}

        {(selectedItem || adding) && <ScheduleEditorDialog
          initialDraft={draft}
          categoryKind={categoryKey === PERSONAL_CATEGORY_KEY ? "personal" : "course"}
          categoryColor={resolveCategoryColor(categoryKey, categoryColorByKey)}
          readOnly={Boolean(selectedItem && !selectedItem.eventId)}
          onColorChange={(color) => onColorChange(categoryKey, color)}
          onClose={() => { setSelectedItem(undefined); setAdding(false); }}
          onSave={(nextDraft) => { onSave(nextDraft, selectedItem?.eventId); setSelectedItem(undefined); setAdding(false); }}
        />}
      </section>
    </dialog>
  );
}
