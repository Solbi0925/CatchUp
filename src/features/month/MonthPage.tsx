import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { demoTodayDate } from "../../application/clock";
import { demoInteractionClock } from "../../application/clock";
import type { CalendarEvent } from "../../domain/types";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { MonthCalendar } from "./MonthCalendar";
import { MonthScheduleDialog } from "./MonthScheduleDialog";
import {
  buildMonthGrid,
  formatMonthKey,
  parseCanonicalDate,
  parseCanonicalMonth,
  resolveMonthQuery,
  shiftMonth,
} from "./monthModel";
import {
  buildMonthScheduleDateIndex,
  buildMonthScheduleItems,
} from "./monthSelectors";
import mockCalendarEventMutation, {
  type CalendarEventMutationAdapter,
} from "./mockCalendarEventMutation";
import type { EditableCalendarEventFields } from "./monthForm";

export function MonthPage({
  mutation = mockCalendarEventMutation,
}: {
  mutation?: CalendarEventMutationAdapter;
}) {
  const { state, dispatch } = usePrototypeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resolved = resolveMonthQuery(searchParams, demoTodayDate);
  const rawMonth = searchParams.get("month");
  const selectedDate = parseCanonicalDate(searchParams.get("date"))
    ? searchParams.get("date")!
    : demoTodayDate;
  const sheetOpen =
    searchParams.get("sheet") === "schedule" &&
    parseCanonicalDate(searchParams.get("date")) !== null;
  const wasSheetOpenRef = useRef(false);
  const focusReturnDateRef = useRef(selectedDate);

  useEffect(() => {
    if (rawMonth === resolved.month) return;
    const next = new URLSearchParams(searchParams);
    next.set("month", resolved.month);
    navigate(
      { pathname: location.pathname, search: `?${next.toString()}` },
      { replace: true, state: location.state },
    );
  }, [
    location.pathname,
    location.state,
    navigate,
    rawMonth,
    resolved.month,
    searchParams,
  ]);

  useEffect(() => {
    if (sheetOpen) focusReturnDateRef.current = selectedDate;
    if (wasSheetOpenRef.current && !sheetOpen) {
      const focusDate = focusReturnDateRef.current;
      window.setTimeout(() => {
        document
          .querySelector<HTMLButtonElement>(
            `button[data-month-date="${focusDate}"]`,
          )
          ?.focus();
      }, 0);
    }
    wasSheetOpenRef.current = sheetOpen;
  }, [selectedDate, sheetOpen]);

  const scheduleItems = useMemo(
    () =>
      buildMonthScheduleItems(
        Object.values(state.extractedItemsById),
        Object.values(state.calendarEventsById),
      ),
    [state.calendarEventsById, state.extractedItemsById],
  );
  const schedulesByDate = useMemo(
    () => buildMonthScheduleDateIndex(scheduleItems),
    [scheduleItems],
  );
  const gridCells = useMemo(() => buildMonthGrid(resolved.month), [resolved.month]);
  const monthParts = parseCanonicalMonth(resolved.month)!;
  const monthLabel = `${monthParts.year}년 ${monthParts.month}월`;

  const replaceMonth = (month: string) => {
    const next = new URLSearchParams();
    next.set("month", month);
    navigate(
      { pathname: location.pathname, search: `?${next.toString()}` },
      { replace: true },
    );
  };

  const closeSheet = () => {
    if ((location.state as { fromMonth?: boolean } | null)?.fromMonth) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("date");
    next.delete("sheet");
    navigate(
      { pathname: location.pathname, search: `?${next.toString()}` },
      { replace: true, state: location.state },
    );
  };

  return (
    <>
      <MonthCalendar
        monthKey={resolved.month}
        monthLabel={monthLabel}
        gridCells={gridCells}
        schedulesByDate={schedulesByDate}
        selectedDate={selectedDate}
        todayDate={demoTodayDate}
        onPreviousMonth={() => replaceMonth(shiftMonth(resolved.month, -1))}
        onNextMonth={() => replaceMonth(shiftMonth(resolved.month, 1))}
        onToday={() =>
          replaceMonth(formatMonthKey(parseCanonicalDate(demoTodayDate)!)!)
        }
        onSelectDate={(date) => {
          const next = new URLSearchParams(searchParams);
          next.set("month", date.slice(0, 7));
          next.set("date", date);
          next.set("sheet", "schedule");
          navigate(
            { pathname: location.pathname, search: `?${next.toString()}` },
            { state: { fromMonth: true } },
          );
        }}
      />
      {sheetOpen && (
        <MonthScheduleDialog
          selectedDate={selectedDate}
          schedules={schedulesByDate.get(selectedDate) ?? []}
          calendarEventsById={state.calendarEventsById}
          onClose={closeSheet}
          onCreate={async (fields: EditableCalendarEventFields) => {
            const id =
              typeof crypto.randomUUID === "function"
                ? `catchup-${crypto.randomUUID()}`
                : `catchup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const event: CalendarEvent = {
              id,
              userId: state.user.id,
              ...fields,
              source: "catchup",
              updatedAt: demoInteractionClock.now().toISOString(),
            };
            await mutation.save(event);
            dispatch({ type: "calendar/eventCreated", payload: { id, ...fields } });
          }}
          onUpdate={async (eventId, fields) => {
            const existing = state.calendarEventsById[eventId];
            if (!existing || existing.source !== "catchup") return;
            const event: CalendarEvent = {
              ...existing,
              ...fields,
              updatedAt: demoInteractionClock.now().toISOString(),
            };
            await mutation.save(event);
            dispatch({
              type: "calendar/eventUpdated",
              payload: { id: eventId, ...fields },
            });
            if (fields.date !== selectedDate) {
              const next = new URLSearchParams(searchParams);
              next.set("month", fields.date.slice(0, 7));
              next.set("date", fields.date);
              next.set("sheet", "schedule");
              navigate(
                {
                  pathname: location.pathname,
                  search: `?${next.toString()}`,
                },
                { replace: true, state: location.state },
              );
            }
          }}
          onDelete={async (eventId) => {
            const existing = state.calendarEventsById[eventId];
            if (!existing || existing.source !== "catchup") return;
            await mutation.delete(eventId);
            dispatch({ type: "calendar/eventDeleted", payload: { id: eventId } });
          }}
        />
      )}
    </>
  );
}
