import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { useAiMate } from "../ai-mate/AiMateProvider";
import { AiMateCharacter } from "../ai-mate/components/AiMateCharacter";
import { selectTodayViewModel } from "./todaySelectors";
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

export function TodayPage() {
  const { state, dispatch } = usePrototypeStore();
  const { openWithDraft } = useAiMate();
  const [selectedDate, setSelectedDate] = useState(demoTodayDate);
  const hasDocuments = Object.keys(state.documentsById).length > 0;
  const hasPlan = Object.keys(state.weeklyPlansById).length > 0;
  const viewModel = useMemo(
    () => selectTodayViewModel(state, selectedDate),
    [selectedDate, state],
  );

  return (
    <section className="today-page">
      <header className="today-header">
        <h1>오늘도 따라잡아볼까요? 👋</h1>
      </header>

      <div className="today-week" aria-label="이번 주 날짜 선택">
        {viewModel.days.map((day) => (
          <button
            key={day.date}
            type="button"
            className={day.isSelected ? "selected" : ""}
            aria-current={day.isSelected ? "date" : undefined}
            aria-pressed={day.isSelected}
            aria-label={`7월 ${day.dayOfMonth}일 ${day.weekdayLabel}요일${day.isToday ? ", 오늘" : ""}${day.isSelected ? ", 선택됨" : ""}`}
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
              <h2>아직 생성된 주간 계획이 없어요.</h2>
              <p>확인한 학업 자료를 바탕으로 이번 주 계획을 만들어보세요.</p>
            </div>
            <AiMateCharacter size={72} />
          </article>
          <section className="today-section">
            <div className="today-section-heading">
              <h2>오늘의 할 일</h2>
              <span>0개</span>
            </div>
            <div className="today-zero-state">
              <strong>아직 이번 주 할 일이 없어요.</strong>
              <p>AI Mate에서 이번 주 계획을 생성해보세요.</p>
              <button
                type="button"
                onClick={() => openWithDraft("이번 주 계획을 생성해줘")}
              >
                AI Mate에서 계획 생성
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
              <p>
                오늘 집중하면 목표 달성이 더 쉬워요. 💪 · 조정 잔여{" "}
                {viewModel.adjustmentRemaining}회
              </p>
            </div>
            <AiMateCharacter size={72} />
          </article>

          <section className="today-section">
            <div className="today-section-heading">
              <div>
                <h2>
                  {selectedDate === demoTodayDate
                    ? "오늘의 할 일"
                    : `${formatSelectedDate(selectedDate)} 할 일`}
                </h2>
                <span>{viewModel.todos.length}개</span>
              </div>
              <button
                type="button"
                className="today-add-button"
                onClick={() => openWithDraft(`${selectedDate} 할 일을 추가하고 싶어`)}
              >
                추가
              </button>
            </div>
            {viewModel.todos.length === 0 ? (
              <div className="today-zero-state">
                <strong>이날의 할 일은 없어요.</strong>
                <p>다른 날짜를 확인하거나 AI Mate에게 계획 조정을 요청해보세요.</p>
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
                    <div>
                      <span className="today-course">{todo.courseOrSource}</span>
                      <h3>{todo.title}</h3>
                      <div className="today-todo-meta">
                        <span>
                          ⚑ 우선순위{" "}
                          {todo.priority === "high" ? "높음" : todo.priority === "medium" ? "보통" : "낮음"}
                        </span>
                        {todo.dueAt && <span>▣ {formatDueDate(todo.dueAt)} 마감</span>}
                      </div>
                      <details>
                        <summary>추천 이유 보기</summary>
                        <p>
                          예상 {todo.estimatedMinutes}분 · {todo.recommendationSummary}
                        </p>
                      </details>
                    </div>
                    <button
                      type="button"
                      aria-label={`${todo.title} AI Mate로 수정`}
                      onClick={() => openWithDraft(`${todo.title} 계획을 조정해줘`)}
                    >
                      ✎
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
                <span>{viewModel.schedules.length}개</span>
              </div>
            </div>
            {viewModel.schedules.length === 0 ? (
              <div className="today-zero-state">
                <strong>예정된 일정이 없어요.</strong>
              </div>
            ) : (
              <div className="today-card-list">
                {viewModel.schedules.map((schedule) => (
                  <article className="today-schedule-card" key={schedule.id}>
                    <time>{schedule.timeLabel}</time>
                    <div>
                      <h3>{schedule.title}</h3>
                      <p>
                        {scheduleTypeLabels[schedule.type]} · {schedule.sourceLabel}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
