import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { AiMateCharacter } from "../ai-mate/components/AiMateCharacter";
import { useAiMate } from "../ai-mate/AiMateProvider";
import { ScheduleEditorDialog, type ScheduleDraft } from "../calendar/ScheduleEditorDialog";
import { PERSONAL_CATEGORY_KEY, resolveCategoryColor } from "../calendar/calendarColors";
import { selectTodayViewModel } from "./todaySelectors";
import type { TodayScheduleViewModel } from "./todayTypes";
import { currentTodayDate } from "../../application/clock";
import { AcademicEventEditorDialog } from "../upload/AcademicEventEditorDialog";
import { CalendarIcon, ClockIcon } from "../../ui/icons";
import { GoogleCalendarSyncStatus } from "../calendar/GoogleCalendarSyncStatus";
import "./today.css";

const scheduleTypeLabels = {
  deadline: "마감",
  submission: "제출",
  exam: "시험",
  notice: "중요 공지",
  class: "수업",
  personal: "개인 일정",
} as const;

function formatSelectedDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDueDate(isoDate: string) {
  const [, month, day] = isoDate.split("-").map(Number);
  const date = new Date(`${isoDate}T00:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
  return `${month}/${day} (${weekday})`;
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function TodayScheduleSection({
  selectedDate,
  todayDate,
  schedules,
  onAdd,
  onEdit,
}: {
  selectedDate: string;
  todayDate: string;
  schedules: TodayScheduleViewModel[];
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  return <section className="today-section">
    <div className="today-section-heading">
      <div><h2>{selectedDate === todayDate ? "오늘의 예정 일정" : `${formatSelectedDate(selectedDate)} 예정 일정`}</h2></div>
      <button type="button" className="today-add-button" onClick={onAdd}>추가</button>
    </div>
    {schedules.length === 0 ? <div className="today-zero-state"><strong>예정된 일정이 없어요.</strong></div> : <div className="today-card-list">
      {schedules.map((schedule) => <button type="button" className={`today-schedule-card${schedule.isProvisional ? " is-provisional" : ""}`} key={schedule.id} onClick={() => onEdit(schedule.id)} aria-label={`${schedule.title} 일정 ${schedule.sourceLabel === "Google Calendar" ? "보기" : "수정"}`}>
        <time>{schedule.timeLabel}</time>
        <div><h3>{schedule.title}</h3><p>{schedule.isProvisional ? "미확정 학업 일정" : scheduleTypeLabels[schedule.type]} · {schedule.sourceLabel}</p></div>
      </button>)}
    </div>}
  </section>;
}

export function TodayPage() {
  const { state, dispatch } = usePrototypeStore();
  const { openWithDraft, openForTodo } = useAiMate();
  const todayDate = useMemo(() => currentTodayDate(), []);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [editingScheduleId, setEditingScheduleId] = useState<string>();
  const [addingSchedule, setAddingSchedule] = useState(false);
  const hasDocuments = Object.keys(state.documentsById).length > 0 || Object.keys(state.extractedItemsById).length > 0;
  const hasPlan = Object.keys(state.weeklyPlansById).length > 0;
  const recentlyChangedTodoIds = useMemo(() => {
    const latest = Object.values(state.planAdjustmentsById).filter((adjustment) => adjustment.trigger === "USER_REQUEST").sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return new Set(latest?.changedTodoIds ?? []);
  }, [state.planAdjustmentsById]);
  const viewModel = useMemo(
    () => selectTodayViewModel(state, selectedDate, todayDate),
    [selectedDate, state, todayDate],
  );
  const editingSchedule = viewModel.schedules.find((item) => item.id === editingScheduleId);
  const editingEvent = editingSchedule?.calendarEventId ? state.calendarEventsById[editingSchedule.calendarEventId] : undefined;
  const editingItem = editingSchedule?.extractedItemId ? state.extractedItemsById[editingSchedule.extractedItemId] : undefined;
  const editingMeeting = editingItem && editingSchedule?.classMeetingId ? editingItem.classMeetingTimes.find((meeting) => meeting.id === editingSchedule.classMeetingId) : undefined;
  const editorDraft: ScheduleDraft = editingEvent ? {
    title: editingEvent.title, date: editingEvent.date, startTime: editingEvent.startTime, endTime: editingEvent.endTime, isAllDay: editingEvent.isAllDay, eventType: editingEvent.eventType,
  } : editingMeeting && editingItem ? {
    title: editingItem.title, date: selectedDate, startTime: editingMeeting.startTime, endTime: editingMeeting.endTime, isAllDay: false, eventType: "class",
  } : editingItem ? {
    title: editingItem.title, date: editingItem.date ?? selectedDate, startTime: editingItem.time, endTime: null, isAllDay: editingItem.isAllDay === true, eventType: editingSchedule?.type ?? "class",
  } : { title: "", date: selectedDate, startTime: "09:00", endTime: "10:00", isAllDay: false, eventType: "personal" };
  const editorCategoryKey = editingSchedule?.categoryKey ?? PERSONAL_CATEGORY_KEY;

  return (
    <section className="today-page">
      <div className="today-week-navigation">
        <button type="button" aria-label="이전 주" onClick={() => setSelectedDate((date) => addDays(date, -7))}>‹</button>
        <strong>{viewModel.weekStart.slice(5).replace("-", ".")} 주</strong>
        <button type="button" aria-label="다음 주" onClick={() => setSelectedDate((date) => addDays(date, 7))}>›</button>
      </div>
      <div className="today-week" aria-label="이번 주 날짜 선택">
        {viewModel.days.map((day) => (
          <button
            key={day.date}
            type="button"
            className={`${day.isSelected ? "selected" : ""} ${hasPlan && !day.isInPlanRange ? "outside-plan" : ""}`.trim()}
            aria-current={day.isSelected ? "date" : undefined}
            aria-pressed={day.isSelected}
            aria-label={`${Number(day.date.slice(5, 7))}월 ${day.dayOfMonth}일 ${day.weekdayLabel}요일${day.isToday ? ", 오늘" : ""}${day.isSelected ? ", 선택됨" : ""}`}
            onClick={() => setSelectedDate(day.date)}
          >
            <span>{day.weekdayLabel}</span>
            <strong>{day.dayOfMonth}</strong>
          </button>
        ))}
      </div>

      {!hasDocuments && (
          <article className="today-empty-card">
            <span className="today-empty-icon upload" aria-hidden="true">↑</span>
            <div>
              <h2>아직 업로드된 자료가 없어요.</h2>
              <p>학업 자료를 올리면 AI Mate가 중요한 일정과 할 일을 정리해줘요.</p>
              <Link to="/upload">Upload로 이동</Link>
            </div>
          </article>
        )}
      {hasDocuments && !hasPlan && (
        <>
          <article className="today-briefing">
            <div>
              <span>AI Mate</span>
              <h2>아직 생성된 주간 계획이 없어요.</h2>
              <p>확인한 학업 자료를 바탕으로 이번 주 계획을 만들어보세요.</p>
            </div>
            <AiMateCharacter size={88} />
          </article>
          <section className="today-section">
            <div className="today-section-heading">
              <h2>오늘의 할 일</h2>
            </div>
            <div className="today-zero-state">
              <strong>아직 이번 주 할 일이 없어요.</strong>
              <p>AI Mate에서 이번 주 계획을 생성해보세요.</p>
              <button
                type="button"
                onClick={() => openWithDraft("", [{ label: "주간계획 생성", draft: "주간계획 생성해줘. 다음의 요청사항을 반영해: " }])}
              >
                계획 생성하기
              </button>
            </div>
          </section>
        </>
      )}
      {hasPlan && (
        <>
          <article className="today-briefing with-plan">
            <div>
              <span>AI Mate</span>
              <h2>4주 일정을 고려해 중요한 일부터 정리했어요.</h2>
              <p>우리 오늘도 같이 하나씩 따라잡아봐요~<br />하나씩 끝내다 보면 분명 가벼워질 거예요!</p>
            </div>
            <AiMateCharacter size={88} />
          </article>

          <section className="today-section">
            <div className="today-section-heading">
              <div>
                <h2>
                  {selectedDate === todayDate
                    ? "오늘의 할 일"
                    : `${formatSelectedDate(selectedDate)} 할 일`}
                </h2>
              </div>
            </div>
            {viewModel.todos.length === 0 ? (
              <div className="today-zero-state">
                <strong>이날의 할 일은 없어요.</strong>
                <p>다른 날짜를 확인하거나 AI Mate에게 계획 조정을 요청해보세요.</p>
                <button
                  type="button"
                  onClick={() =>
                    openWithDraft("현재 주간계획을 다음의 요청사항을 반영해서 조정해줘: ")
                  }
                >
                  계획 조정
                </button>
              </div>
            ) : (
              <div className="today-card-list">
                {viewModel.todos.map((todo) => (
                  <article className={`today-todo-card${todo.completed ? " completed" : ""}${recentlyChangedTodoIds.has(todo.id) ? " recently-adjusted" : ""}`} key={todo.id}>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      aria-label={`완료: ${todo.title}`}
                      onChange={(event) =>
                        dispatch({
                          type: "todo/completionSet",
                          payload: { todoId: todo.id, isCompleted: event.currentTarget.checked },
                        })
                      }
                    />
                    <button
                      type="button"
                      className="today-todo-content"
                      aria-label={`${todo.title} AI Mate에서 보기`}
                      onClick={() => openForTodo(todo.id)}
                    >
                      <span className="today-course">{todo.courseOrSource}</span>
                      {recentlyChangedTodoIds.has(todo.id) && <span className="today-adjusted-label">방금 조정</span>}
                      <h3>{todo.title}</h3>
                      <div className="today-todo-meta">
                        {todo.estimatedMinutes > 0 && <span><ClockIcon />{todo.estimatedMinutes < 60 ? `${todo.estimatedMinutes}M` : `${Number((todo.estimatedMinutes / 60).toFixed(1))}H`}</span>}
                        <span><CalendarIcon />{todo.dueAt ? `${formatDueDate(todo.dueAt)} 마감` : "마감일 없음"}</span>
                      </div>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

        </>
      )}
      {(hasDocuments || viewModel.schedules.length > 0 || state.user.calendarConnectionStatus === "connected") && <TodayScheduleSection
        selectedDate={selectedDate}
        todayDate={todayDate}
        schedules={viewModel.schedules}
        onAdd={() => setAddingSchedule(true)}
        onEdit={setEditingScheduleId}
      />}
      {state.user.calendarConnectionStatus === "connected" ? <GoogleCalendarSyncStatus /> : (
        <article className="today-empty-card">
          <span className="today-empty-icon" aria-hidden="true">31</span>
          <div>
            <h2>Google Calendar를 연결해보세요</h2>
            <p>개인 일정을 불러오려면 Google Calendar 연결이 필요해요.</p>
            <Link to="/onboarding/calendar">연결하기</Link>
          </div>
        </article>
      )}
      {(editingSchedule || addingSchedule) && <div className="today-editor-backdrop">
        {editingItem && !editingMeeting ? <AcademicEventEditorDialog
          item={editingItem}
          onClose={() => setEditingScheduleId(undefined)}
          onDelete={() => { dispatch({ type: "extraction/itemDeleted", payload: { id: editingItem.id } }); setEditingScheduleId(undefined); }}
          onSave={(item) => { dispatch({ type: "extraction/itemReplaced", payload: item }); setEditingScheduleId(undefined); }}
        /> : <ScheduleEditorDialog
          draftIdentity={editingSchedule?.id ?? `new-${selectedDate}`}
          initialDraft={editorDraft}
          categoryKind={editorCategoryKey === PERSONAL_CATEGORY_KEY ? "personal" : "course"}
          categoryColor={resolveCategoryColor(editorCategoryKey, state.categoryColorByKey)}
          onColorChange={(color) => dispatch({ type: "calendar/categoryColorSet", payload: { categoryKey: editorCategoryKey, color } })}
          onClose={() => { setEditingScheduleId(undefined); setAddingSchedule(false); }}
          readOnly={editingEvent?.source === "google-calendar"}
          onDelete={editingSchedule ? () => {
            if (editingMeeting && editingItem) dispatch({ type: "extraction/classMeetingDeleted", payload: { id: editingItem.id, meetingId: editingMeeting.id } });
            else if (editingItem) dispatch({ type: "extraction/itemDeleted", payload: { id: editingItem.id } });
            else if (editingEvent) dispatch({ type: "calendar/eventDeleted", payload: { id: editingEvent.id } });
            setEditingScheduleId(undefined); setAddingSchedule(false);
          } : undefined}
          onSave={(draft) => {
            if (editingMeeting && editingItem) dispatch({
              type: "extraction/classMeetingUpdated",
              payload: { id: editingItem.id, meetingId: editingMeeting.id, title: draft.title, weekday: new Date(`${draft.date}T00:00:00Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6, startTime: draft.startTime ?? editingMeeting.startTime, endTime: draft.endTime ?? editingMeeting.endTime },
            });
            else if (editingItem) dispatch({
              type: "extraction/itemUpdated",
              payload: {
                id: editingItem.id,
                title: draft.title,
                date: draft.date,
                time: draft.startTime,
                isAllDay: draft.isAllDay,
              },
            });
            else if (editingEvent) dispatch({ type: "calendar/eventUpdated", payload: { id: editingEvent.id, ...draft, eventType: editingEvent.eventType } });
            else dispatch({ type: "calendar/eventCreated", payload: { id: `catchup-${Date.now()}`, ...draft, eventType: "personal" } });
            setEditingScheduleId(undefined); setAddingSchedule(false);
          }}
        />}
      </div>}
    </section>
  );
}
