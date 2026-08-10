import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { AiMateCharacter } from "../ai-mate/components/AiMateCharacter";
import { useAiMate, type AiMatePromptChip } from "../ai-mate/AiMateProvider";
import { ScheduleEditorDialog, type ScheduleDraft } from "../calendar/ScheduleEditorDialog";
import { PERSONAL_CATEGORY_KEY, resolveCategoryColor } from "../calendar/calendarColors";
import type { CalendarEvent } from "../../domain/types";
import { getCalendarWeekStart, selectTodayViewModel } from "./todaySelectors";
import { demoTodayDate } from "../../application/clock";
import "./today.css";

const scheduleTypeLabels = {
  deadline: "마감",
  submission: "제출",
  exam: "시험",
  notice: "중요 공지",
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

function formatPromptDate(isoDate: string) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}`;
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatWeekRange(startDate: string, endDate: string) {
  const [, startMonth, startDay] = startDate.split("-").map(Number);
  const [, endMonth, endDay] = endDate.split("-").map(Number);
  return startMonth === endMonth
    ? `${startMonth}월 ${startDay}일–${endDay}일`
    : `${startMonth}월 ${startDay}일–${endMonth}월 ${endDay}일`;
}

function formatDateAriaLabel(isoDate: string) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}월 ${day}일`;
}

export function TodayPage() {
  const { state, dispatch } = usePrototypeStore();
  const { openWithDraft } = useAiMate();
  const [selectedDate, setSelectedDate] = useState(demoTodayDate);
  const [visibleWeekStart, setVisibleWeekStart] = useState(
    getCalendarWeekStart(demoTodayDate),
  );
  const [editingScheduleId, setEditingScheduleId] = useState<string>();
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [eventOverrides, setEventOverrides] = useState<Record<string, CalendarEvent>>({});
  const hasDocuments = Object.keys(state.documentsById).length > 0;
  const hasPlan = Object.keys(state.weeklyPlansById).length > 0;
  const viewModel = useMemo(
    () => selectTodayViewModel(
      { ...state, calendarEventsById: { ...state.calendarEventsById, ...eventOverrides } },
      selectedDate,
      visibleWeekStart,
    ),
    [eventOverrides, selectedDate, state, visibleWeekStart],
  );
  const editingSchedule = viewModel.schedules.find((item) => item.id === editingScheduleId);
  const editingEvent = editingSchedule ? ({ ...state.calendarEventsById, ...eventOverrides })[editingSchedule.id] : undefined;
  const editingItem = editingSchedule ? state.extractedItemsById[editingSchedule.id] : undefined;
  const editorDraft: ScheduleDraft = editingEvent ? {
    title: editingEvent.title, date: editingEvent.date, startTime: editingEvent.startTime, endTime: editingEvent.endTime, isAllDay: editingEvent.isAllDay, eventType: editingEvent.eventType,
  } : editingItem ? {
    title: editingItem.title, date: editingItem.date, startTime: editingItem.time, endTime: null, isAllDay: !editingItem.time, eventType: "class",
  } : { title: "", date: selectedDate, startTime: "09:00", endTime: "10:00", isAllDay: false, eventType: "personal" };
  const editorCategoryKey = editingSchedule?.categoryKey ?? PERSONAL_CATEGORY_KEY;
  const moveWeek = (amount: -7 | 7) => {
    setVisibleWeekStart((current) => addDays(current, amount));
    setSelectedDate((current) => addDays(current, amount));
  };

  return (
    <section className="today-page">
      <div className="today-week-navigation">
        <button type="button" aria-label="이전 주" onClick={() => moveWeek(-7)}>‹</button>
        <span>{formatWeekRange(viewModel.weekStart, viewModel.weekEnd)}</span>
        <button type="button" aria-label="다음 주" onClick={() => moveWeek(7)}>›</button>
      </div>
      <div className="today-week" aria-label="월요일부터 일요일 날짜 선택">
        {viewModel.days.map((day) => (
          <button
            key={day.date}
            type="button"
            className={[
              day.isSelected && "selected",
              !day.isWithinPlanRange && "outside-plan",
            ].filter(Boolean).join(" ")}
            aria-current={day.isSelected ? "date" : undefined}
            aria-pressed={day.isSelected}
            aria-label={`${formatDateAriaLabel(day.date)} ${day.weekdayLabel}요일${day.isToday ? ", 오늘" : ""}${!day.isWithinPlanRange ? ", 현재 7일 계획 범위 밖" : ""}${day.isSelected ? ", 선택됨" : ""}`}
            onClick={() => setSelectedDate(day.date)}
          >
            <span>{day.weekdayLabel}</span>
            <strong>{day.dayOfMonth}</strong>
          </button>
        ))}
      </div>

      {state.user.calendarConnectionStatus !== "connected" && (
        <article className="today-empty-card">
          <span className="today-empty-icon" aria-hidden="true">31</span>
          <div>
            <h2>Google Calendar를 연결해보세요</h2>
            <p>개인 일정을 불러오려면 Google Calendar 연결이 필요해요.</p>
            <Link to="/onboarding/calendar">연결하기</Link>
          </div>
        </article>
      )}
      {state.user.calendarConnectionStatus === "connected" &&
        !hasDocuments && (
          <article className="today-empty-card">
            <span className="today-empty-icon upload" aria-hidden="true">↑</span>
            <div>
              <h2>아직 업로드된 자료가 없어요.</h2>
              <p>학업 자료를 올리면 AI Mate가 중요한 일정과 할 일을 정리해줘요.</p>
              <Link to="/upload">Upload로 이동</Link>
            </div>
          </article>
        )}
      {state.user.calendarConnectionStatus === "connected" && hasDocuments && !hasPlan && (
        <>
          <article className="today-briefing">
            <div>
              <span>AI Mate</span>
              <h2>아직 생성된 7일 계획이 없어요.</h2>
              <p>확인한 학업 자료를 바탕으로 오늘부터 계획을 만들어보세요.</p>
            </div>
            <AiMateCharacter size={84} />
          </article>
          <section className="today-section">
            <div className="today-section-heading">
              <h2>오늘의 할 일</h2>
            </div>
            <div className="today-zero-state">
              <strong>아직 계획된 할 일이 없어요.</strong>
              <p>AI Mate에서 오늘부터 7일 계획을 생성해보세요.</p>
              <button
                type="button"
                onClick={() => openWithDraft("오늘부터 7일 계획을 생성해줘")}
              >
                계획 생성하기
              </button>
            </div>
          </section>
        </>
      )}
      {state.user.calendarConnectionStatus === "connected" && hasPlan && (
        <>
          <article className="today-briefing with-plan">
            <div>
              <span>AI Mate</span>
              <h2>4주 일정을 고려해 중요한 일부터 정리했어요.</h2>
              <p>우리 오늘도 같이 하나씩 따라잡아봐요!</p>
            </div>
            <AiMateCharacter size={84} />
          </article>

          <section className="today-section">
            <div className="today-section-heading">
              <div>
                <h2>
                  {selectedDate === demoTodayDate
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
                    openWithDraft(`${formatPromptDate(selectedDate)}일 계획을 조정해줘`)
                  }
                >
                  계획 조정
                </button>
              </div>
            ) : (
              <div className="today-card-list">
                {viewModel.todos.map((todo) => (
                  <article className={`today-todo-card${todo.completed ? " completed" : ""}`} key={todo.id}>
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
                      onClick={() => {
                        const promptDate = formatPromptDate(selectedDate);
                        const chips: AiMatePromptChip[] = [
                          {
                            label: "할 일 추천이유",
                            draft: `${todo.title}을 추천한 이유를 알려줘`,
                          },
                          {
                            label: "할 일 조정",
                            draft: `${todo.title} 할 일을 조정해줘`,
                          },
                          {
                            label: `${promptDate}일 할 일 추가`,
                            draft: `${promptDate}일 할 일을 추가해줘`,
                          },
                        ];
                        openWithDraft("", chips);
                      }}
                    >
                      <span className="today-course">{todo.courseOrSource}</span>
                      <h3>{todo.title}</h3>
                      <div className="today-todo-meta">
                        <span>{todo.estimatedMinutes < 60 ? `${todo.estimatedMinutes}M` : `${Number((todo.estimatedMinutes / 60).toFixed(1))}H`}</span>
                        {todo.dueAt && <span>▣ {formatDueDate(todo.dueAt)} 마감</span>}
                      </div>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="today-section">
            <div className="today-section-heading">
              <div>
                <h2>
                  {selectedDate === demoTodayDate
                    ? "오늘의 예정 일정"
                    : `${formatSelectedDate(selectedDate)} 예정 일정`}
                </h2>
              </div>
              <button type="button" className="today-add-button" onClick={() => setAddingSchedule(true)}>추가</button>
            </div>
            {viewModel.schedules.length === 0 ? (
              <div className="today-zero-state">
                <strong>예정된 일정이 없어요.</strong>
              </div>
            ) : (
              <div className="today-card-list">
                {viewModel.schedules.map((schedule) => (
                  <button type="button" className="today-schedule-card" key={schedule.id} onClick={() => setEditingScheduleId(schedule.id)} aria-label={`${schedule.title} 일정 수정`}>
                    <time>{schedule.timeLabel}</time>
                    <div>
                      <h3>{schedule.title}</h3>
                      <p>
                        {scheduleTypeLabels[schedule.type]} · {schedule.sourceLabel}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {(editingSchedule || addingSchedule) && <div className="today-editor-backdrop">
        <ScheduleEditorDialog
          initialDraft={editorDraft}
          categoryKind={editorCategoryKey === PERSONAL_CATEGORY_KEY ? "personal" : "course"}
          categoryColor={resolveCategoryColor(editorCategoryKey, state.categoryColorByKey)}
          onColorChange={(color) => dispatch({ type: "calendar/categoryColorSet", payload: { categoryKey: editorCategoryKey, color } })}
          onClose={() => { setEditingScheduleId(undefined); setAddingSchedule(false); }}
          onSave={(draft) => {
            if (editingItem) dispatch({
              type: "extraction/itemUpdated",
              payload: {
                id: editingItem.id,
                title: draft.title,
                date: draft.date,
                time: draft.startTime,
              },
            });
            else if (editingEvent?.source === "google-calendar") setEventOverrides((current) => ({ ...current, [editingEvent.id]: { ...editingEvent, ...draft } }));
            else if (editingEvent) dispatch({ type: "calendar/eventUpdated", payload: { id: editingEvent.id, ...draft } });
            else dispatch({ type: "calendar/eventCreated", payload: { id: `catchup-${Date.now()}`, ...draft } });
            setEditingScheduleId(undefined); setAddingSchedule(false);
          }}
        />
      </div>}
    </section>
  );
}
