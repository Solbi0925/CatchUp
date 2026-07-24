import { describe, expect, it } from "vitest";
import type { CalendarEvent, ExtractedItem } from "../../domain/types";
import {
  buildMonthScheduleDateIndex,
  buildMonthScheduleItems,
  compareMonthScheduleDetailItems,
  compareMonthScheduleRepresentativeItems,
  getMonthDotCount,
  getRepresentativeMonthScheduleItem,
  isMonthScheduleItemEditable,
} from "./monthSelectors";

function extractedItem(overrides: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    id: "extracted-1",
    documentId: "document-1",
    title: "알고리즘 과제",
    itemType: "deadline",
    courseName: "알고리즘",
    date: "2026-07-21",
    time: null,
    submissionMethod: null,
    requiredMaterials: null,
    difficulty: "medium",
    estimatedDurationMinutes: 60,
    reviewStatus: "confirmed",
    isUserEdited: false,
    ...overrides,
  };
}

function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "calendar-1",
    userId: "user-1",
    title: "스터디",
    date: "2026-07-21",
    startTime: "10:00",
    endTime: "11:00",
    isAllDay: false,
    eventType: "personal",
    source: "google-calendar",
    updatedAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("Month schedule selectors", () => {
  it("includes confirmed extracted items but omits items that need review", () => {
    const items = buildMonthScheduleItems(
      [extractedItem(), extractedItem({ id: "review-1", reviewStatus: "needs-review" })],
      [],
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "extracted-item:extracted-1",
      sourceItemId: "extracted-1",
      source: "extracted-item",
      sourceLabel: "업로드 자료",
      documentId: "document-1",
      editable: false,
    });
  });

  it("maps every source to its label and derives editability from the shared predicate", () => {
    const items = buildMonthScheduleItems(
      [extractedItem()],
      [calendarEvent(), calendarEvent({ id: "catchup-1", source: "catchup" })],
    );
    const uploaded = items.find((item) => item.source === "extracted-item")!;
    const google = items.find((item) => item.source === "google-calendar")!;
    const catchup = items.find((item) => item.source === "catchup")!;

    expect([uploaded, google, catchup].map(({ source, sourceLabel, editable }) => ({ source, sourceLabel, editable }))).toEqual([
      { source: "extracted-item", sourceLabel: "업로드 자료", editable: false },
      { source: "google-calendar", sourceLabel: "Google Calendar", editable: false },
      { source: "catchup", sourceLabel: "CatchUp 직접 입력", editable: true },
    ]);
    expect(isMonthScheduleItemEditable(uploaded)).toBe(false);
    expect(isMonthScheduleItemEditable(google)).toBe(false);
    expect(isMonthScheduleItemEditable(catchup)).toBe(true);
  });

  it("groups merged items in one date index", () => {
    const index = buildMonthScheduleDateIndex(buildMonthScheduleItems(
      [extractedItem({ date: "2026-07-22" })],
      [calendarEvent(), calendarEvent({ id: "calendar-2", date: "2026-07-22", title: "수업" })],
    ));

    expect(index.get("2026-07-21")?.map((item) => item.title)).toEqual(["스터디"]);
    expect(index.get("2026-07-22")?.map((item) => item.title)).toEqual(["알고리즘 과제", "수업"]);
  });

  it("sorts detail items with all-day first, then time, title, and stable ID", () => {
    const items = buildMonthScheduleItems(
      [
        extractedItem({ id: "deadline-b", title: "나", itemType: "deadline", time: null }),
        extractedItem({ id: "deadline-a", title: "가", itemType: "deadline", time: null }),
      ],
      [
        calendarEvent({ id: "later", title: "이른 제목", startTime: "13:00" }),
        calendarEvent({ id: "early", title: "늦은 제목", startTime: "09:00" }),
        calendarEvent({ id: "same-b", title: "같음", startTime: "10:00" }),
        calendarEvent({ id: "same-a", title: "같음", startTime: "10:00" }),
      ],
    );

    expect([...items].sort(compareMonthScheduleDetailItems).map((item) => item.id)).toEqual([
      "extracted-item:deadline-a",
      "extracted-item:deadline-b",
      "google-calendar:early",
      "google-calendar:same-a",
      "google-calendar:same-b",
      "google-calendar:later",
    ]);
  });

  it("selects representative chips by priority independently from detail ordering", () => {
    const items = buildMonthScheduleItems(
      [
        extractedItem({ id: "notice", title: "공지", itemType: "notice", time: null }),
        extractedItem({ id: "exam", title: "중간고사", itemType: "exam", time: null }),
      ],
      [calendarEvent({ id: "fixed", title: "동아리", startTime: "09:00" })],
    );

    expect([...items].sort(compareMonthScheduleDetailItems)[0]?.itemType).toBe("notice");
    expect([...items].sort(compareMonthScheduleRepresentativeItems).map((item) => item.itemType)).toEqual([
      "exam",
      "personal",
      "notice",
    ]);
    expect(getRepresentativeMonthScheduleItem(items)?.title).toBe("중간고사");
  });

  it("caps calendar dot counts at three", () => {
    expect([0, 1, 2, 3, 4].map(getMonthDotCount)).toEqual([0, 1, 2, 3, 3]);
  });

  it("returns empty collections for empty input", () => {
    const items = buildMonthScheduleItems([], []);

    expect(items).toEqual([]);
    expect(buildMonthScheduleDateIndex(items)).toEqual(new Map());
    expect(getRepresentativeMonthScheduleItem(items)).toBeUndefined();
  });
});
