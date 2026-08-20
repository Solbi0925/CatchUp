import { useMemo, useRef, useState } from "react";
import { currentTodayDate } from "../../application/clock";
import { selectScheduleAcademicItems } from "../../domain/selectors";
import type { CalendarEvent } from "../../domain/types";
import { demoCalendarEvents } from "../../mocks/templates";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { MonthCalendar } from "./MonthCalendar";
import { MonthScheduleDialog, type MonthEventDraft, type MonthScheduleTarget } from "./MonthScheduleDialog";
import { buildMonthGrid, parseCanonicalMonth, shiftMonth } from "./monthModel";
import { buildMonthSchedules, groupSchedulesByDate } from "./monthSelectors";

export function MonthPage() {
  const { state, dispatch } = usePrototypeStore();
  const todayDate = useMemo(() => currentTodayDate(), []);
  const [visibleMonth, setVisibleMonth] = useState(todayDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mockEventOverrides, setMockEventOverrides] = useState<
    Record<string, CalendarEvent>
  >({});
  const [hiddenMockEventIds, setHiddenMockEventIds] = useState<Set<string>>(() => new Set());
  const returnFocusDate = useRef(selectedDate);
  const month = parseCanonicalMonth(visibleMonth)!;
  const gridCells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const calendarEventsById = useMemo(
    () => {
      return {
        ...Object.fromEntries(demoCalendarEvents.filter((event) => !hiddenMockEventIds.has(event.id)).map((event) => [event.id, event])),
        ...state.calendarEventsById,
        ...mockEventOverrides,
      };
    },
    [hiddenMockEventIds, mockEventOverrides, state.calendarEventsById],
  );
  const schedules = useMemo(
    () =>
      buildMonthSchedules(
        selectScheduleAcademicItems(state),
        Object.values(calendarEventsById),
        state.planningProfile,
        gridCells.length ? { startDate: gridCells[0].date, endDate: gridCells[gridCells.length - 1].date } : undefined,
      ),
    [calendarEventsById, gridCells, state],
  );
  const schedulesByDate = useMemo(
    () => groupSchedulesByDate(schedules),
    [schedules],
  );

  const openDate = (date: string) => {
    returnFocusDate.current = date;
    setSelectedDate(date);
    setVisibleMonth(date.slice(0, 7));
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-month-date="${returnFocusDate.current}"]`,
        )
        ?.focus();
    });
  };

  const saveEvent = (draft: MonthEventDraft, target?: MonthScheduleTarget) => {
    if (target?.extractedItemId && target.classMeetingId) {
      dispatch({ type: "extraction/classMeetingUpdated", payload: { id: target.extractedItemId, meetingId: target.classMeetingId, title: draft.title, weekday: new Date(`${draft.date}T00:00:00Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6, startTime: draft.startTime ?? "09:00", endTime: draft.endTime ?? draft.startTime ?? "10:00" } });
    } else if (target?.extractedItemId) {
      dispatch({
        type: "extraction/itemUpdated",
        payload: {
          id: target.extractedItemId,
          title: draft.title,
          date: draft.date,
          time: draft.startTime,
          isAllDay: draft.isAllDay,
        },
      });
    } else if (target?.eventId) {
      const eventId = target.eventId;
      const existingEvent = calendarEventsById[eventId];
      if (existingEvent?.source === "google-calendar" && !state.calendarEventsById[eventId]) {
        setMockEventOverrides((current) => ({
          ...current,
          [eventId]: {
            ...existingEvent,
            ...draft,
            eventType: existingEvent.eventType,
            updatedAt: new Date().toISOString(),
          },
        }));
      } else {
        dispatch({ type: "calendar/eventUpdated", payload: { id: eventId, ...draft, eventType: existingEvent?.eventType ?? "personal" } });
      }
    } else {
      dispatch({
        type: "calendar/eventCreated",
        payload: {
          id: `catchup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...draft,
          eventType: "personal",
        },
      });
    }
    if (draft.date !== selectedDate) {
      returnFocusDate.current = draft.date;
      setSelectedDate(draft.date);
      setVisibleMonth(draft.date.slice(0, 7));
    }
  };

  return (
    <div className="month-page">
      <MonthCalendar
        monthLabel={`${month.year}년 ${month.month}월`}
        gridCells={gridCells}
        schedulesByDate={schedulesByDate}
        selectedDate={selectedDate}
        todayDate={todayDate}
        onPreviousMonth={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
        onNextMonth={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
        onToday={() => {
          setVisibleMonth(todayDate.slice(0, 7));
          setSelectedDate(todayDate);
        }}
        onSelectDate={openDate}
        categoryColorByKey={state.categoryColorByKey}
      />
      {sheetOpen && (
        <MonthScheduleDialog
          selectedDate={selectedDate}
          schedules={schedulesByDate.get(selectedDate) ?? []}
          eventsById={calendarEventsById}
          onClose={closeSheet}
          onSave={saveEvent}
          onDelete={(target) => {
            if (target.extractedItemId && target.classMeetingId) dispatch({ type: "extraction/classMeetingDeleted", payload: { id: target.extractedItemId, meetingId: target.classMeetingId } });
            else if (target.extractedItemId) dispatch({ type: "extraction/itemDeleted", payload: { id: target.extractedItemId } });
            else if (target.eventId && state.calendarEventsById[target.eventId]) dispatch({ type: "calendar/eventDeleted", payload: { id: target.eventId } });
            else if (target.eventId) {
              setHiddenMockEventIds((current) => new Set(current).add(target.eventId!));
              setMockEventOverrides((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== target.eventId)));
            }
          }}
          categoryColorByKey={state.categoryColorByKey}
          onColorChange={(categoryKey, color) =>
            dispatch({ type: "calendar/categoryColorSet", payload: { categoryKey, color } })
          }
        />
      )}
    </div>
  );
}
