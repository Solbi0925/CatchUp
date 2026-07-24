import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../domain/types";
import {
  createEditScheduleDraft,
  createScheduleDraft,
  isScheduleDraftDirty,
  toEditableCalendarEventFields,
  validateScheduleDraft,
  type ScheduleDraft,
} from "./monthForm";

function catchUpEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "catchup-1",
    userId: "user-1",
    title: "팀 프로젝트 회의",
    date: "2026-07-24",
    startTime: "13:00",
    endTime: "14:00",
    isAllDay: false,
    eventType: "class",
    source: "catchup",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

const validDraft: ScheduleDraft = {
  title: "팀 프로젝트 회의",
  date: "2026-07-24",
  startTime: "13:00",
  endTime: "14:00",
  calendar: "catchup",
  eventType: "personal",
};

describe("Month schedule form", () => {
  it("creates the selected-date defaults and initializes an editable CatchUp event", () => {
    expect(createScheduleDraft("2026-07-24")).toEqual({
      title: "",
      date: "2026-07-24",
      startTime: "09:00",
      endTime: "10:00",
      calendar: "catchup",
      eventType: "personal",
    });
    expect(createEditScheduleDraft(catchUpEvent())).toEqual({
      ...validDraft,
      eventType: "class",
    });
    expect(createEditScheduleDraft(catchUpEvent({ source: "google-calendar" }))).toBeNull();
  });

  it("trims a valid title before producing editable fields and rejects blank titles", () => {
    expect(toEditableCalendarEventFields({ ...validDraft, title: "  회의 준비  " })).toEqual({
      title: "회의 준비",
      date: "2026-07-24",
      startTime: "13:00",
      endTime: "14:00",
      isAllDay: false,
      eventType: "personal",
    });
    expect(validateScheduleDraft({ ...validDraft, title: "  " }).errors.title).toBe(
      "일정 제목을 입력해주세요.",
    );
  });

  it("reports field errors for missing or non-canonical dates and times", () => {
    expect(validateScheduleDraft({ ...validDraft, date: "" }).errors.date).toBeDefined();
    expect(validateScheduleDraft({ ...validDraft, date: "2026-02-29" }).errors.date).toBeDefined();
    expect(validateScheduleDraft({ ...validDraft, startTime: "9:00" }).errors.startTime).toBeDefined();
    expect(validateScheduleDraft({ ...validDraft, endTime: "25:00" }).errors.endTime).toBeDefined();
  });

  it("rejects equal and reversed times instead of accepting cross-midnight", () => {
    expect(validateScheduleDraft({ ...validDraft, endTime: "13:00" }).errors.endTime).toBe(
      "종료 시간은 시작 시간보다 늦어야 합니다.",
    );
    expect(validateScheduleDraft({ ...validDraft, endTime: "12:59" }).errors.endTime).toBe(
      "종료 시간은 시작 시간보다 늦어야 합니다.",
    );
  });

  it("accepts valid personal and class schedule drafts", () => {
    expect(validateScheduleDraft(validDraft).isValid).toBe(true);
    expect(validateScheduleDraft({ ...validDraft, eventType: "class" }).isValid).toBe(true);
  });

  it("rejects runtime values outside the calendar and event type allowlists", () => {
    expect(validateScheduleDraft({ ...validDraft, calendar: "google" } as unknown as ScheduleDraft).errors.calendar).toBeDefined();
    expect(validateScheduleDraft({ ...validDraft, eventType: "exam" } as unknown as ScheduleDraft).errors.eventType).toBeDefined();
  });

  it("is clean initially and dirty when any draft field changes", () => {
    expect(isScheduleDraftDirty(validDraft, validDraft)).toBe(false);
    (Object.keys(validDraft) as Array<keyof ScheduleDraft>).forEach((field) => {
      const changed = { ...validDraft, [field]: `${validDraft[field]} changed` } as ScheduleDraft;
      expect(isScheduleDraftDirty(changed, validDraft)).toBe(true);
    });
  });

  it("converts only valid drafts into narrow reducer fields without immutable record data", () => {
    const fields = toEditableCalendarEventFields(validDraft);

    expect(fields).toEqual({
      title: "팀 프로젝트 회의",
      date: "2026-07-24",
      startTime: "13:00",
      endTime: "14:00",
      isAllDay: false,
      eventType: "personal",
    });
    expect(fields).not.toHaveProperty("source");
    expect(fields).not.toHaveProperty("userId");
    expect(fields).not.toHaveProperty("updatedAt");
    expect(toEditableCalendarEventFields({ ...validDraft, title: "" })).toBeNull();
  });
});
