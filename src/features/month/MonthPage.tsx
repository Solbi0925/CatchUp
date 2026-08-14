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
  const returnFocusDate = useRef(selectedDate);

  const calendarEventsById = useMemo(
    () => {
      return {
        ...Object.fromEntries(demoCalendarEvents.map((event) => [event.id, event])),
        ...state.calendarEventsById,
        ...mockEventOverrides,
      };
    },
    [mockEventOverrides, state.calendarEventsById],
  );
  const schedules = useMemo(
    () =>
      buildMonthSchedules(
        selectScheduleAcademicItems(state),
        Object.values(calendarEventsById),
        state.planningProfile,
      ),
    [calendarEventsById, state],
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

  const saveEvent = (draft: MonthEventDraft, target?: MonthScheduleTarget) => {
    if (target?.extractedItemId) {
      dispatch({
        type: "extraction/itemUpdated",
        payload: {
          id: target.extractedItemId,
          title: draft.title,
          date: draft.date,
          time: draft.startTime,
        },
      });
    } else if (target?.eventId) {
      const eventId = target.eventId;
      const existingEvent = calendarEventsById[eventId];
      if (existingEvent?.source === "google-calendar") {
        setMockEventOverrides((current) => ({
          ...current,
          [eventId]: {
            ...existingEvent,
            ...draft,
            updatedAt: new Date().toISOString(),
          },
        }));
      } else {
        dispatch({ type: "calendar/eventUpdated", payload: { id: eventId, ...draft } });
      }
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
          onDelete={(eventId) =>
            dispatch({ type: "calendar/eventDeleted", payload: { id: eventId } })
          }
          categoryColorByKey={state.categoryColorByKey}
          onColorChange={(categoryKey, color) =>
            dispatch({ type: "calendar/categoryColorSet", payload: { categoryKey, color } })
          }
        />
      )}
    </div>
  );
}
