import "./styles.css";

const fixedYear = 2026;
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const monthNames = Array.from({ length: 12 }, (_, index) => `${index + 1}월`);
const calendars = ["Catchup Calendar", "Google Calendar + Catchup Calendar"];
const types = ["학업", "개인"];

const state = {
  currentYear: fixedYear,
  currentMonthIndex: 6,
  selectedDate: "2026-07-10",
  sheetOpen: false,
  monthMenuOpen: false,
  activeTimeField: null,
  editingId: null,
  events: [
    {
      id: crypto.randomUUID(),
      title: "과제 제출",
      date: "2026-07-03",
      startTime: "23:00",
      endTime: "23:59",
      calendar: "Catchup Calendar",
      type: "학업",
    },
    {
      id: crypto.randomUUID(),
      title: "중간고사",
      date: "2026-07-15",
      startTime: "14:00",
      endTime: "16:00",
      calendar: "Google Calendar + Catchup Calendar",
      type: "학업",
    },
    {
      id: crypto.randomUUID(),
      title: "팀 회의",
      date: "2026-07-18",
      startTime: "10:00",
      endTime: "11:00",
      calendar: "Catchup Calendar",
      type: "개인",
    },
    {
      id: crypto.randomUUID(),
      title: "중간고사",
      date: "2026-07-18",
      startTime: "14:00",
      endTime: "16:00",
      calendar: "Google Calendar + Catchup Calendar",
      type: "학업",
    },
    {
      id: crypto.randomUUID(),
      title: "퀴즈 복습",
      date: "2026-07-22",
      startTime: "19:00",
      endTime: "20:00",
      calendar: "Catchup Calendar",
      type: "학업",
    },
    {
      id: crypto.randomUUID(),
      title: "팀 회의",
      date: "2026-07-28",
      startTime: "09:00",
      endTime: "10:00",
      calendar: "Catchup Calendar",
      type: "개인",
    },
  ],
};

document.querySelector("#app").innerHTML = `
  <main class="app-stage">
    <section class="mobile-app" aria-label="CatchUp Month page">
      <div class="app-screen">
        <header class="top-bar">
          <div class="month-picker">
            <button class="month-title" id="monthButton" type="button" aria-label="월 선택" aria-expanded="false">
              <span id="monthTitle"></span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
            </button>
            <div class="month-menu" id="monthMenu" role="menu" aria-label="2026년 월 선택"></div>
          </div>
          <div class="header-actions">
            <button class="icon-button" type="button" aria-label="달력 보기">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 2v4M17 2v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>
              </svg>
            </button>
            <button class="icon-button" type="button" aria-label="메뉴">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16"/>
              </svg>
            </button>
          </div>
        </header>

        <section class="calendar-card" aria-label="월간 일정">
          <div class="weekday-row" id="weekdayRow"></div>
          <div class="month-grid" id="monthGrid"></div>
          <p class="month-empty-state" id="monthEmptyState"></p>
        </section>

        <button class="mate-button" type="button" aria-label="AI Mate">
          <span class="mate-eyes" aria-hidden="true"><span></span><span></span></span>
        </button>

        <nav class="bottom-nav" aria-label="하단 탭">
          <button class="nav-item" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10"/>
            </svg>
            <span>Today</span>
          </button>
          <button class="nav-item active" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 2v4M17 2v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>
            </svg>
            <span>Month</span>
          </button>
          <button class="nav-item" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V4M8 8l4-4 4 4M5 16a5 5 0 0 0 14 0M4 19h16"/>
            </svg>
            <span>Upload</span>
          </button>
        </nav>

        <div class="sheet-backdrop" id="sheetBackdrop"></div>
        <section class="schedule-sheet" id="scheduleSheet" aria-label="일정 수정 탭">
          <button class="sheet-handle" id="closeSheetButton" type="button" aria-label="일정 수정 탭 닫기"></button>
          <div class="sheet-scroll">
            <h2 id="sheetTitle"></h2>
            <ul class="schedule-list" id="scheduleList"></ul>
            <button class="add-schedule-button" id="addScheduleButton" type="button">+ 일정 추가</button>

            <form class="schedule-form" id="scheduleForm">
              <label>
                <span>제목</span>
                <input id="titleInput" name="title" type="text" placeholder="일정 제목을 입력하세요" required />
              </label>
              <label>
                <span>날짜</span>
                <input id="dateInput" name="date" type="date" required />
              </label>
              <div class="time-range" role="group" aria-label="시작 시간과 종료 시간">
                <span class="time-label">시간</span>
                <div class="time-inputs">
                  <div class="time-control">
                    <span>시작</span>
                    <button class="time-trigger" id="startTimeButton" type="button" data-time-target="startTime">
                      <span id="startTimeText">09:00</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                      </svg>
                    </button>
                    <input id="startTimeInput" name="startTime" type="hidden" required />
                  </div>
                  <span class="time-separator" aria-hidden="true">-</span>
                  <div class="time-control">
                    <span>종료</span>
                    <button class="time-trigger" id="endTimeButton" type="button" data-time-target="endTime">
                      <span id="endTimeText">10:00</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                      </svg>
                    </button>
                    <input id="endTimeInput" name="endTime" type="hidden" required />
                  </div>
                </div>
                <div class="time-picker" id="timePicker" aria-label="시간 선택">
                  <div class="time-picker-column" id="hourOptions"></div>
                  <div class="time-picker-column" id="minuteOptions"></div>
                </div>
              </div>
              <label>
                <span>캘린더</span>
                <select id="calendarInput" name="calendar" required></select>
              </label>
              <label>
                <span>유형</span>
                <select id="typeInput" name="type" required></select>
              </label>
              <button class="save-button" type="submit">저장</button>
            </form>
          </div>
        </section>
      </div>
    </section>
  </main>
`;

const elements = {
  monthButton: document.querySelector("#monthButton"),
  monthTitle: document.querySelector("#monthTitle"),
  monthMenu: document.querySelector("#monthMenu"),
  weekdayRow: document.querySelector("#weekdayRow"),
  monthGrid: document.querySelector("#monthGrid"),
  monthEmptyState: document.querySelector("#monthEmptyState"),
  sheetBackdrop: document.querySelector("#sheetBackdrop"),
  scheduleSheet: document.querySelector("#scheduleSheet"),
  closeSheetButton: document.querySelector("#closeSheetButton"),
  sheetTitle: document.querySelector("#sheetTitle"),
  scheduleList: document.querySelector("#scheduleList"),
  addScheduleButton: document.querySelector("#addScheduleButton"),
  scheduleForm: document.querySelector("#scheduleForm"),
  titleInput: document.querySelector("#titleInput"),
  dateInput: document.querySelector("#dateInput"),
  startTimeButton: document.querySelector("#startTimeButton"),
  endTimeButton: document.querySelector("#endTimeButton"),
  startTimeText: document.querySelector("#startTimeText"),
  endTimeText: document.querySelector("#endTimeText"),
  startTimeInput: document.querySelector("#startTimeInput"),
  endTimeInput: document.querySelector("#endTimeInput"),
  calendarInput: document.querySelector("#calendarInput"),
  typeInput: document.querySelector("#typeInput"),
  timePicker: document.querySelector("#timePicker"),
  hourOptions: document.querySelector("#hourOptions"),
  minuteOptions: document.querySelector("#minuteOptions"),
};

function init() {
  elements.weekdayRow.innerHTML = weekdays.map((day) => `<span>${day}</span>`).join("");
  elements.monthMenu.innerHTML = monthNames
    .map(
      (month, index) =>
        `<button class="month-option" type="button" role="menuitem" data-month="${index}">${month}</button>`,
    )
    .join("");
  fillSelect(elements.calendarInput, calendars);
  fillSelect(elements.typeInput, types);
  bindEvents();
  resetForm();
  render();
}

function bindEvents() {
  elements.monthButton.addEventListener("click", toggleMonthMenu);
  elements.monthMenu.addEventListener("click", selectMonth);
  elements.monthGrid.addEventListener("click", handleCalendarClick);
  elements.scheduleList.addEventListener("click", handleScheduleAction);
  elements.startTimeButton.addEventListener("click", openTimePicker);
  elements.endTimeButton.addEventListener("click", openTimePicker);
  elements.timePicker.addEventListener("click", selectTimePart);
  elements.sheetBackdrop.addEventListener("click", closeSheet);
  elements.closeSheetButton.addEventListener("click", closeSheet);
  elements.addScheduleButton.addEventListener("click", () => {
    state.editingId = null;
    resetForm();
    elements.titleInput.focus();
  });
  elements.scheduleForm.addEventListener("submit", saveSchedule);
  document.addEventListener("click", closeMonthMenuFromOutside);
  document.addEventListener("click", closeTimePickerFromOutside);
}

function toggleMonthMenu(event) {
  event.stopPropagation();
  state.monthMenuOpen = !state.monthMenuOpen;
  renderMonthPicker();
}

function selectMonth(event) {
  const monthButton = event.target.closest("[data-month]");
  if (!monthButton) {
    return;
  }

  const nextMonthIndex = Number(monthButton.dataset.month);
  const selectedDay = Math.min(getSelectedDay(), getDaysInMonth(state.currentYear, nextMonthIndex));

  state.currentMonthIndex = nextMonthIndex;
  state.selectedDate = toDateKey(new Date(state.currentYear, nextMonthIndex, selectedDay));
  state.monthMenuOpen = false;
  state.sheetOpen = false;
  state.editingId = null;
  resetForm();
  render();
}

function closeMonthMenuFromOutside(event) {
  if (!state.monthMenuOpen || event.target.closest(".month-picker")) {
    return;
  }

  state.monthMenuOpen = false;
  renderMonthPicker();
}

function handleCalendarClick(event) {
  const dayButton = event.target.closest("[data-date]");
  if (!dayButton) {
    return;
  }

  state.selectedDate = dayButton.dataset.date;
  state.sheetOpen = true;
  state.editingId = null;
  resetForm();
  render();
}

function handleScheduleAction(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const { action, id } = actionButton.dataset;

  if (action === "delete") {
    state.events = state.events.filter((schedule) => schedule.id !== id);
    if (state.editingId === id) {
      state.editingId = null;
      resetForm();
    }
    render();
    return;
  }

  if (action === "edit") {
    const schedule = state.events.find((item) => item.id === id);
    if (!schedule) {
      return;
    }

    state.editingId = id;
    elements.titleInput.value = schedule.title;
    elements.dateInput.value = schedule.date;
    setTimeValue("startTime", schedule.startTime);
    setTimeValue("endTime", schedule.endTime);
    elements.calendarInput.value = schedule.calendar;
    elements.typeInput.value = schedule.type;
    elements.titleInput.focus();
  }
}

function openTimePicker(event) {
  event.stopPropagation();
  state.activeTimeField = event.currentTarget.dataset.timeTarget;
  renderTimePicker();
}

function closeTimePickerFromOutside(event) {
  if (!state.activeTimeField || event.target.closest(".time-picker") || event.target.closest(".time-trigger")) {
    return;
  }

  state.activeTimeField = null;
  renderTimePicker();
}

function selectTimePart(event) {
  const option = event.target.closest("[data-time-part]");
  if (!option || !state.activeTimeField) {
    return;
  }

  const current = parseTimeValue(getActiveTimeValue());
  const part = option.dataset.timePart;

  if (part === "hour") {
    current.hour = Number(option.dataset.value);
  }

  if (part === "minute") {
    current.minute = Number(option.dataset.value);
  }

  setTimeValue(state.activeTimeField, formatTimeValue(current));
  renderTimePicker();
}

function saveSchedule(event) {
  event.preventDefault();

  const formData = new FormData(elements.scheduleForm);
  const schedule = {
    id: state.editingId || crypto.randomUUID(),
    title: formData.get("title").trim(),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    calendar: formData.get("calendar"),
    type: formData.get("type"),
  };

  if (schedule.endTime <= schedule.startTime) {
    elements.endTimeInput.setCustomValidity("종료 시간은 시작 시간보다 늦어야 합니다.");
    elements.endTimeInput.reportValidity();
    return;
  }

  elements.endTimeInput.setCustomValidity("");

  if (state.editingId) {
    state.events = state.events.map((item) => (item.id === state.editingId ? schedule : item));
  } else {
    state.events = [...state.events, schedule];
  }

  state.selectedDate = schedule.date;
  state.editingId = null;
  resetForm();
  render();
}

function render() {
  renderMonthPicker();
  renderCalendar();
  renderSheet();
}

function renderMonthPicker() {
  const currentMonthDate = getCurrentMonthDate();
  elements.monthTitle.textContent = formatMonthTitle(currentMonthDate);
  elements.monthButton.setAttribute("aria-expanded", String(state.monthMenuOpen));
  elements.monthMenu.classList.toggle("open", state.monthMenuOpen);

  elements.monthMenu.querySelectorAll("[data-month]").forEach((button) => {
    const isSelected = Number(button.dataset.month) === state.currentMonthIndex;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-current", isSelected ? "true" : "false");
  });
}

function renderCalendar() {
  const days = buildMonthDays(getCurrentMonthDate());
  const hasMonthEvents = state.events.some((schedule) =>
    schedule.date.startsWith(`${state.currentYear}-${String(state.currentMonthIndex + 1).padStart(2, "0")}`),
  );

  elements.monthGrid.innerHTML = days
    .map((day) => {
      const dayEvents = getEventsForDate(day.dateKey);
      const visibleEvents = dayEvents.slice(0, 3);
      const overflowCount = Math.max(dayEvents.length - visibleEvents.length, 0);
      const hasEvents = dayEvents.length > 0;
      const isSelected = day.dateKey === state.selectedDate;

      return `
        <button class="day-cell ${day.inCurrentMonth ? "" : "outside"} ${
          isSelected ? "selected" : ""
        }" type="button" data-date="${day.dateKey}" aria-label="${formatKoreanDate(day.dateKey)}">
          <span class="day-number">${day.date.getDate()}</span>
          ${hasEvents ? '<span class="event-dot" aria-hidden="true"></span>' : ""}
          ${
            visibleEvents.length
              ? `<span class="event-stack">${visibleEvents
                  .map((item) => `<span class="event-chip">${escapeHtml(shortenTitle(item.title))}</span>`)
                  .join("")}${
                  overflowCount ? `<span class="event-overflow">+${overflowCount}</span>` : ""
                }</span>`
              : ""
          }
        </button>
      `;
    })
    .join("");
  elements.monthEmptyState.textContent = hasMonthEvents
    ? ""
    : "앞으로 4주간 참고할 주요 일정이 없습니다.";
  elements.monthEmptyState.classList.toggle("visible", !hasMonthEvents);
}

function renderSheet() {
  const selectedEvents = getEventsForDate(state.selectedDate);
  elements.scheduleSheet.classList.toggle("open", state.sheetOpen);
  elements.sheetBackdrop.classList.toggle("visible", state.sheetOpen);
  elements.sheetTitle.textContent = `${formatShortDate(state.selectedDate)} 일정`;

  elements.scheduleList.innerHTML = selectedEvents.length
    ? selectedEvents
        .map(
          (schedule) => `
            <li class="schedule-item" data-action="edit" data-id="${schedule.id}">
              <span class="schedule-flag" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(schedule.title)}</strong>
                <span>${schedule.startTime} - ${schedule.endTime}</span>
              </div>
              <button class="row-icon" type="button" data-action="edit" data-id="${
                schedule.id
              }" aria-label="${escapeHtml(schedule.title)} 수정">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m4 20 4.4-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20ZM14.5 6.5l3 3"/>
                </svg>
              </button>
              <button class="row-icon" type="button" data-action="delete" data-id="${
                schedule.id
              }" aria-label="${escapeHtml(schedule.title)} 삭제">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>
                </svg>
              </button>
            </li>
          `,
        )
        .join("")
    : '<li class="empty-schedule">아직 등록된 일정이 없습니다.</li>';
}

function resetForm() {
  elements.scheduleForm.reset();
  elements.titleInput.value = "";
  elements.dateInput.value = state.selectedDate;
  setTimeValue("startTime", "09:00");
  setTimeValue("endTime", "10:00");
  elements.calendarInput.value = calendars[0];
  elements.typeInput.value = types[0];
  elements.endTimeInput.setCustomValidity("");
  state.activeTimeField = null;
  renderTimePicker();
}

function closeSheet() {
  state.sheetOpen = false;
  state.editingId = null;
  state.activeTimeField = null;
  resetForm();
  render();
}

function setTimeValue(field, value) {
  const normalizedValue = normalizeTimeValue(value);

  if (field === "startTime") {
    elements.startTimeInput.value = normalizedValue;
    elements.startTimeText.textContent = normalizedValue;
    return;
  }

  elements.endTimeInput.value = normalizedValue;
  elements.endTimeText.textContent = normalizedValue;
}

function renderTimePicker() {
  elements.timePicker.classList.toggle("open", Boolean(state.activeTimeField));

  if (!state.activeTimeField) {
    return;
  }

  const current = parseTimeValue(getActiveTimeValue());
  elements.hourOptions.innerHTML = Array.from({ length: 24 }, (_, index) => index + 1)
    .map(
      (hour) =>
        `<button class="time-option ${
          current.hour === hour ? "selected" : ""
        }" type="button" data-time-part="hour" data-value="${hour}">${String(hour).padStart(
          2,
          "0",
        )}</button>`,
    )
    .join("");
  elements.minuteOptions.innerHTML = Array.from({ length: 60 }, (_, minute) => minute)
    .map(
      (minute) =>
        `<button class="time-option ${
          current.minute === minute ? "selected" : ""
        }" type="button" data-time-part="minute" data-value="${minute}">${String(minute).padStart(
          2,
          "0",
        )}</button>`,
    )
    .join("");
}

function getActiveTimeValue() {
  return state.activeTimeField === "startTime"
    ? elements.startTimeInput.value
    : elements.endTimeInput.value;
}

function parseTimeValue(value) {
  const [rawHour, rawMinute] = normalizeTimeValue(value).split(":").map(Number);

  return {
    hour: rawHour === 0 ? 24 : rawHour,
    minute: rawMinute,
  };
}

function formatTimeValue({ hour, minute }) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(value) ? value : "09:00";
}

function buildMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const totalCells = firstDay.getDay() + getDaysInMonth(year, month) > 35 ? 42 : 35;
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: totalCells }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);

    return {
      date: day,
      dateKey: toDateKey(day),
      inCurrentMonth: day.getMonth() === month,
    };
  });
}

function getCurrentMonthDate() {
  return new Date(state.currentYear, state.currentMonthIndex, 1);
}

function getSelectedDay() {
  return Number(state.selectedDate.split("-")[2]);
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function fillSelect(select, options) {
  select.innerHTML = options.map((option) => `<option value="${option}">${option}</option>`).join("");
}

function getEventsForDate(dateKey) {
  return state.events
    .filter((schedule) => schedule.date === dateKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function formatMonthTitle(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function formatKoreanDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortenTitle(title) {
  return title.length > 5 ? `${title.slice(0, 5)}` : title;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
