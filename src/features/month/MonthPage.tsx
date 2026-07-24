import { useMemo, useRef, useState } from "react";
import { demoTodayDate } from "../../application/clock";
import type { CalendarEvent } from "../../domain/types";
import { demoCalendarEvents } from "../../mocks/templates";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { MonthCalendar } from "./MonthCalendar";
import { MonthScheduleDialog, type MonthEventDraft } from "./MonthScheduleDialog";
import { buildMonthGrid, parseCanonicalMonth, shiftMonth } from "./monthModel";
import { buildMonthSchedules, groupSchedulesByDate } from "./monthSelectors";

export function MonthPage() {
  const { state, dispatch } = usePrototypeStore();
  const [visibleMonth, setVisibleMonth] = useState(demoTodayDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(demoTodayDate);
  const [sheetOpen, setSheetOpen] = useState(false);
  const returnFocusDate = useRef(selectedDate);

  const schedules = useMemo(
    () => {
      const calendarEvents = Object.values({
        ...Object.fromEntries(demoCalendarEvents.map((event) => [event.id, event])),
        ...state.calendarEventsById,
      });
      return buildMonthSchedules(
        Object.values(state.extractedItemsById),
        calendarEvents,
      );
    },
    [state.calendarEventsById, state.extractedItemsById],
  );
  const schedulesByDate = useMemo(
    () => groupSchedulesByDate(schedules),
    [schedules],
  );
  const month = parseCanonicalMonth(visibleMonth)!;

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

  const saveEvent = (draft: MonthEventDraft, eventId?: string) => {
    if (eventId) {
      dispatch({ type: "calendar/eventUpdated", payload: { id: eventId, ...draft } });
    } else {
      dispatch({
        type: "calendar/eventCreated",
        payload: {
          id: `catchup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...draft,
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
        gridCells={buildMonthGrid(visibleMonth)}
        schedulesByDate={schedulesByDate}
        selectedDate={selectedDate}
        todayDate={demoTodayDate}
        onPreviousMonth={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
        onNextMonth={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
        onToday={() => {
          setVisibleMonth(demoTodayDate.slice(0, 7));
          setSelectedDate(demoTodayDate);
        }}
        onSelectDate={openDate}
      />
      {sheetOpen && (
        <MonthScheduleDialog
          selectedDate={selectedDate}
          schedules={schedulesByDate.get(selectedDate) ?? []}
          eventsById={state.calendarEventsById}
          onClose={closeSheet}
          onSave={saveEvent}
          onDelete={(eventId) =>
            dispatch({ type: "calendar/eventDeleted", payload: { id: eventId } })
          }
        />
      )}
    </div>
  );
}
