import type { CalendarEvent } from "../../domain/types";
import { parseCanonicalDate } from "./monthModel";

export type ScheduleDraft = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  calendar: "catchup";
  eventType: "personal" | "class";
};

export type ScheduleDraftErrors = Partial<Record<keyof ScheduleDraft, string>>;

export type ScheduleDraftValidation = {
  isValid: boolean;
  errors: ScheduleDraftErrors;
};

export type EditableCalendarEventFields = Pick<
  CalendarEvent,
  "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType"
>;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function createScheduleDraft(selectedDate: string): ScheduleDraft {
  return {
    title: "",
    date: selectedDate,
    startTime: "09:00",
    endTime: "10:00",
    calendar: "catchup",
    eventType: "personal",
  };
}

export function createEditScheduleDraft(event: CalendarEvent): ScheduleDraft | null {
  if (event.source !== "catchup" || event.isAllDay || event.startTime === null || event.endTime === null) {
    return null;
  }

  return {
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    calendar: "catchup",
    eventType: event.eventType,
  };
}

function isValidTime(value: string) {
  return TIME_PATTERN.test(value);
}

export function validateScheduleDraft(draft: ScheduleDraft): ScheduleDraftValidation {
  const errors: ScheduleDraftErrors = {};
  const title = draft.title.trim();
  const startTimeIsValid = isValidTime(draft.startTime);
  const endTimeIsValid = isValidTime(draft.endTime);

  if (!title) errors.title = "일정 제목을 입력해주세요.";
  if (!parseCanonicalDate(draft.date)) errors.date = "올바른 날짜를 입력해주세요.";
  if (!startTimeIsValid) errors.startTime = "시작 시간을 HH:mm 형식으로 입력해주세요.";
  if (!endTimeIsValid) errors.endTime = "종료 시간을 HH:mm 형식으로 입력해주세요.";
  if (startTimeIsValid && endTimeIsValid && draft.endTime <= draft.startTime) {
    errors.endTime = "종료 시간은 시작 시간보다 늦어야 합니다.";
  }
  if (draft.calendar !== "catchup") errors.calendar = "CatchUp 캘린더만 선택할 수 있습니다.";
  if (draft.eventType !== "personal" && draft.eventType !== "class") {
    errors.eventType = "일정 유형을 선택해주세요.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

export function isScheduleDraftDirty(current: ScheduleDraft, initial: ScheduleDraft) {
  return (
    current.title !== initial.title ||
    current.date !== initial.date ||
    current.startTime !== initial.startTime ||
    current.endTime !== initial.endTime ||
    current.calendar !== initial.calendar ||
    current.eventType !== initial.eventType
  );
}

export function toEditableCalendarEventFields(
  draft: ScheduleDraft,
): EditableCalendarEventFields | null {
  if (!validateScheduleDraft(draft).isValid) return null;

  return {
    title: draft.title.trim(),
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    isAllDay: false,
    eventType: draft.eventType,
  };
}
