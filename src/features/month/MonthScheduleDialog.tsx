import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBlocker } from "react-router-dom";
import type { CalendarEvent, CalendarEventId } from "../../domain/types";
import {
  createEditScheduleDraft,
  createScheduleDraft,
  isScheduleDraftDirty,
  toEditableCalendarEventFields,
  validateScheduleDraft,
  type EditableCalendarEventFields,
  type ScheduleDraft,
  type ScheduleDraftErrors,
} from "./monthForm";
import type { MonthScheduleItem } from "./monthSelectors";

type FormMode =
  | { type: "creating" }
  | { type: "editing"; eventId: CalendarEventId };

interface ActiveForm {
  mode: FormMode;
  initial: ScheduleDraft;
  draft: ScheduleDraft;
}

type PendingIntent =
  | { type: "router" }
  | { type: "dismiss" }
  | { type: "create" }
  | { type: "edit"; eventId: CalendarEventId }
  | { type: "cancel-form" }
  | { type: "delete"; eventId: CalendarEventId };

interface DeleteState {
  eventId: CalendarEventId;
  pending: boolean;
  error: string;
}

export interface MonthScheduleDialogProps {
  selectedDate: string;
  schedules: readonly MonthScheduleItem[];
  calendarEventsById: Readonly<Record<CalendarEventId, CalendarEvent>>;
  onClose: () => void;
  onCreate: (fields: EditableCalendarEventFields) => Promise<void>;
  onUpdate: (
    eventId: CalendarEventId,
    fields: EditableCalendarEventFields,
  ) => Promise<void>;
  onUpdateDateSaved: (date: string) => void;
  onDelete: (eventId: CalendarEventId) => Promise<void>;
  onOpenExtractedItem?: (documentId: string) => void;
}

function calendarEventId(item: MonthScheduleItem) {
  return item.source === "catchup" ? item.id.slice("catchup:".length) : null;
}

export function MonthScheduleDialog({
  selectedDate,
  schedules,
  calendarEventsById,
  onClose,
  onCreate,
  onUpdate,
  onUpdateDateSaved,
  onDelete,
  onOpenExtractedItem,
}: MonthScheduleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteButtonRefs = useRef(new Map<CalendarEventId, HTMLButtonElement>());
  const allowNextNavigationRef = useRef(false);
  const [form, setForm] = useState<ActiveForm | null>(null);
  const [errors, setErrors] = useState<ScheduleDraftErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const mountedRef = useRef(true);
  const [, month, day] = selectedDate.split("-").map(Number);
  const title = `${month}월 ${day}일 일정`;
  const isDirty = Boolean(
    form && isScheduleDraftDirty(form.draft, form.initial),
  );

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (isDirty || isSaving) &&
      !allowNextNavigationRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  useEffect(() => {
    mountedRef.current = true;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      mountedRef.current = false;
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (blocker.state === "blocked" && !isSaving) {
      setPendingIntent((current) => current ?? { type: "router" });
    }
  }, [blocker.state, isSaving]);

  const resetFormMessages = () => {
    setErrors({});
    setSaveError("");
  };

  const startCreate = () => {
    const initial = createScheduleDraft(selectedDate);
    resetFormMessages();
    setForm({ mode: { type: "creating" }, initial, draft: initial });
  };

  const startEdit = (eventId: CalendarEventId) => {
    const initial = createEditScheduleDraft(calendarEventsById[eventId]);
    if (!initial) return;
    resetFormMessages();
    setForm({ mode: { type: "editing", eventId }, initial, draft: initial });
  };

  const beginDelete = (eventId: CalendarEventId) => {
    setDeleteState({ eventId, pending: false, error: "" });
  };

  const executeIntent = (intent: PendingIntent) => {
    switch (intent.type) {
      case "router":
        if (blocker.state === "blocked") blocker.proceed();
        return;
      case "dismiss":
        allowNextNavigationRef.current = true;
        onClose();
        return;
      case "create":
        startCreate();
        return;
      case "edit":
        startEdit(intent.eventId);
        return;
      case "cancel-form":
        resetFormMessages();
        setForm(null);
        return;
      case "delete":
        resetFormMessages();
        setForm(null);
        beginDelete(intent.eventId);
    }
  };

  const requestIntent = (intent: PendingIntent) => {
    if (isSaving || pendingIntent) return;
    if (isDirty) {
      setPendingIntent(intent);
      return;
    }
    executeIntent(intent);
  };

  const keepWriting = () => {
    if (pendingIntent?.type === "router" && blocker.state === "blocked") {
      blocker.reset();
    }
    setPendingIntent(null);
  };

  const discardAndContinue = () => {
    const intent = pendingIntent;
    if (!intent) return;
    setPendingIntent(null);
    resetFormMessages();
    setForm(null);
    // dirty draft -> [one pending intent] -> continue | discard -> exact intent
    executeIntent(intent);
  };

  const updateDraft = <Field extends keyof ScheduleDraft>(
    field: Field,
    value: ScheduleDraft[Field],
  ) => {
    setForm((current) =>
      current
        ? { ...current, draft: { ...current.draft, [field]: value } }
        : current,
    );
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submitDraft = async () => {
    if (!form || isSaving) return;
    const activeForm = form;
    const validation = validateScheduleDraft(form.draft);
    setErrors(validation.errors);
    const fields = toEditableCalendarEventFields(form.draft);
    if (!fields) return;

    setIsSaving(true);
    setSaveError("");
    try {
      if (activeForm.mode.type === "creating") {
        await onCreate(fields);
      } else {
        await onUpdate(activeForm.mode.eventId, fields);
      }
      if (!mountedRef.current) return;
      if (blockerRef.current.state === "blocked") {
        blockerRef.current.reset();
      }
      if (
        activeForm.mode.type === "editing" &&
        fields.date !== selectedDate
      ) {
        allowNextNavigationRef.current = true;
        onUpdateDateSaved(fields.date);
        allowNextNavigationRef.current = false;
      }
      resetFormMessages();
      setForm(null);
    } catch {
      if (!mountedRef.current) return;
      if (blockerRef.current.state === "blocked") {
        blockerRef.current.reset();
      }
      setSaveError("일정을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      allowNextNavigationRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void submitDraft();
  };

  const performDelete = async (eventId: CalendarEventId) => {
    if (deleteState?.pending) return;
    setDeleteState({ eventId, pending: true, error: "" });
    try {
      await onDelete(eventId);
      setDeleteState(null);
    } catch {
      setDeleteState({
        eventId,
        pending: false,
        error: "일정을 삭제하지 못했어요. 다시 시도해주세요.",
      });
    }
  };

  const cancelDelete = (eventId: CalendarEventId) => {
    setDeleteState(null);
    window.requestAnimationFrame(() => deleteButtonRefs.current.get(eventId)?.focus());
  };

  const fieldDescription = (field: keyof ScheduleDraft) =>
    errors[field] ? `month-schedule-${field}-error` : undefined;
  const rowActionsDisabled = isSaving || deleteState !== null || pendingIntent !== null;
  const displayTime = (schedule: MonthScheduleItem) => {
    if (schedule.isAllDay) return "종일";
    return [schedule.startTime, schedule.endTime].filter(Boolean).join("–");
  };

  return (
    <dialog
      ref={dialogRef}
      className="month-schedule-dialog"
      aria-labelledby="month-schedule-title"
      onCancel={(event) => {
        event.preventDefault();
        requestIntent({ type: "dismiss" });
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target) {
          requestIntent({ type: "dismiss" });
        }
      }}
    >
      <div className="month-schedule-sheet">
        <div className="month-schedule-dialog__handle" aria-hidden="true" />
        <header
          className="month-schedule-dialog__header"
          inert={pendingIntent !== null}
        >
          <h2 id="month-schedule-title">{title}</h2>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => requestIntent({ type: "dismiss" })}
          >
            닫기
          </button>
        </header>

        <div
          className="month-schedule-dialog__scroll"
          inert={pendingIntent !== null}
        >
          <div className="month-schedule-dialog__add">
            <button
              type="button"
              disabled={isSaving || form?.mode.type === "creating"}
              onClick={() => requestIntent({ type: "create" })}
            >
              일정 추가
            </button>
          </div>

          {schedules.length === 0 ? (
            <p className="month-schedule-dialog__empty">
              이 날짜에는 일정이 없어요
            </p>
          ) : (
            <ul className="month-schedule-list">
              {schedules.map((schedule) => {
                const eventId = calendarEventId(schedule);
                const event = eventId ? calendarEventsById[eventId] : null;
                const canEdit = Boolean(
                  event && createEditScheduleDraft(event) !== null,
                );
                const isConfirmingDelete =
                  eventId !== null && deleteState?.eventId === eventId;
                return (
                  <li className="month-schedule-row" key={schedule.id}>
                    <div className="month-schedule-row__body">
                      <strong>{schedule.title}</strong>
                      <span>
                        {displayTime(schedule)}
                      </span>
                      <span>{schedule.sourceLabel}</span>
                    </div>
                    {schedule.source === "extracted-item" &&
                      schedule.documentId &&
                      onOpenExtractedItem && (
                        <button
                          type="button"
                          onClick={() => onOpenExtractedItem(schedule.documentId!)}
                        >
                          업로드 자료 보기
                        </button>
                      )}
                    {eventId && !isConfirmingDelete && (
                      <div className="month-schedule-row__actions">
                        {canEdit && (
                          <button
                            type="button"
                            disabled={rowActionsDisabled}
                            onClick={() =>
                              requestIntent({ type: "edit", eventId })
                            }
                          >
                            수정
                          </button>
                        )}
                        <button
                          ref={(button) => {
                            if (button) deleteButtonRefs.current.set(eventId, button);
                            else deleteButtonRefs.current.delete(eventId);
                          }}
                          type="button"
                          disabled={rowActionsDisabled}
                          onClick={() =>
                            requestIntent({ type: "delete", eventId })
                          }
                        >
                          삭제
                        </button>
                      </div>
                    )}
                    {eventId && isConfirmingDelete && (
                      <div className="month-schedule-row__delete">
                        <p>삭제할까요?</p>
                        {deleteState.error && (
                          <p role="alert">{deleteState.error}</p>
                        )}
                        <button
                          type="button"
                          disabled={deleteState.pending}
                          onClick={() => cancelDelete(eventId)}
                        >
                          취소
                        </button>
                        {deleteState.error ? (
                          <button
                            type="button"
                            disabled={deleteState.pending}
                            onClick={() => void performDelete(eventId)}
                          >
                            다시 시도
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={deleteState.pending}
                            onClick={() => void performDelete(eventId)}
                          >
                            {deleteState.pending ? "삭제 중..." : "삭제"}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {form && (
            <form className="month-schedule-form" onSubmit={submit}>
              {saveError && (
                <div className="month-schedule-form__error">
                  <p role="alert">{saveError}</p>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void submitDraft()}
                  >
                    다시 시도
                  </button>
                </div>
              )}
              <label>
                제목
                <input
                  value={form.draft.title}
                  aria-describedby={fieldDescription("title")}
                  onChange={(event) => updateDraft("title", event.target.value)}
                />
              </label>
              {errors.title && (
                <p id="month-schedule-title-error">{errors.title}</p>
              )}
              <label>
                날짜
                <input
                  type="date"
                  value={form.draft.date}
                  aria-describedby={fieldDescription("date")}
                  onChange={(event) => updateDraft("date", event.target.value)}
                />
              </label>
              {errors.date && (
                <p id="month-schedule-date-error">{errors.date}</p>
              )}
              <label>
                시작 시간
                <input
                  type="time"
                  value={form.draft.startTime}
                  aria-describedby={fieldDescription("startTime")}
                  onChange={(event) =>
                    updateDraft("startTime", event.target.value)
                  }
                />
              </label>
              {errors.startTime && (
                <p id="month-schedule-startTime-error">{errors.startTime}</p>
              )}
              <label>
                종료 시간
                <input
                  type="time"
                  value={form.draft.endTime}
                  aria-describedby={fieldDescription("endTime")}
                  onChange={(event) =>
                    updateDraft("endTime", event.target.value)
                  }
                />
              </label>
              {errors.endTime && (
                <p id="month-schedule-endTime-error">{errors.endTime}</p>
              )}
              <label>
                과목/캘린더
                <select
                  value={form.draft.calendar}
                  aria-describedby={fieldDescription("calendar")}
                  onChange={(event) =>
                    updateDraft(
                      "calendar",
                      event.target.value as ScheduleDraft["calendar"],
                    )
                  }
                >
                  <option value="catchup">개인 일정 · CatchUp</option>
                </select>
              </label>
              <label>
                유형
                <select
                  value={form.draft.eventType}
                  aria-describedby={fieldDescription("eventType")}
                  onChange={(event) =>
                    updateDraft(
                      "eventType",
                      event.target.value as ScheduleDraft["eventType"],
                    )
                  }
                >
                  <option value="personal">개인 일정</option>
                  <option value="class">수업 일정</option>
                </select>
              </label>
              <div className="month-schedule-form__actions">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => requestIntent({ type: "cancel-form" })}
                >
                  취소
                </button>
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          )}
        </div>

        {pendingIntent && (
          <section className="month-schedule-discard" aria-live="polite">
            <p>변경사항을 버릴까요?</p>
            <button type="button" onClick={keepWriting}>
              계속 작성
            </button>
            <button type="button" onClick={discardAndContinue}>
              버리기
            </button>
          </section>
        )}
      </div>
    </dialog>
  );
}
