import type { CalendarEvent, ExtractedItem, ExtractedItemType } from "../../domain/types";

export type MonthScheduleSource = "extracted-item" | CalendarEvent["source"];
export type MonthScheduleType = ExtractedItemType | CalendarEvent["eventType"];

export interface MonthScheduleItem {
  id: string;
  sourceItemId: string | null;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  source: MonthScheduleSource;
  sourceLabel: "업로드 자료" | "Google Calendar" | "CatchUp 직접 입력";
  itemType: MonthScheduleType;
  documentId: string | null;
  editable: boolean;
}

function compareStrings(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sourceLabel(source: MonthScheduleSource): MonthScheduleItem["sourceLabel"] {
  switch (source) {
    case "extracted-item":
      return "업로드 자료";
    case "google-calendar":
      return "Google Calendar";
    case "catchup":
      return "CatchUp 직접 입력";
  }
}

export function isMonthScheduleItemEditable(item: Pick<MonthScheduleItem, "source">) {
  return item.source === "catchup";
}

function extractedItemToMonthScheduleItem(item: ExtractedItem): MonthScheduleItem {
  const source = "extracted-item" as const;
  return {
    id: `${source}:${item.id}`,
    sourceItemId: item.id,
    title: item.title,
    date: item.date,
    startTime: item.time,
    endTime: null,
    isAllDay: item.time === null,
    source,
    sourceLabel: sourceLabel(source),
    itemType: item.itemType,
    documentId: item.documentId,
    editable: isMonthScheduleItemEditable({ source }),
  };
}

function calendarEventToMonthScheduleItem(event: CalendarEvent): MonthScheduleItem {
  return {
    id: `${event.source}:${event.id}`,
    sourceItemId: null,
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    isAllDay: event.isAllDay,
    source: event.source,
    sourceLabel: sourceLabel(event.source),
    itemType: event.eventType,
    documentId: null,
    editable: isMonthScheduleItemEditable({ source: event.source }),
  };
}

export function compareMonthScheduleDetailItems(left: MonthScheduleItem, right: MonthScheduleItem) {
  if (left.isAllDay !== right.isAllDay) return left.isAllDay ? -1 : 1;

  const startTime = compareStrings(left.startTime ?? "", right.startTime ?? "");
  if (startTime !== 0) return startTime;

  const title = compareStrings(left.title, right.title);
  return title !== 0 ? title : compareStrings(left.id, right.id);
}

function representativePriority(item: MonthScheduleItem) {
  if (item.itemType === "exam" || item.itemType === "deadline" || item.itemType === "submission") {
    return 0;
  }
  if (item.source !== "extracted-item" && !item.isAllDay && item.startTime !== null) return 1;
  if (item.itemType === "notice") return 2;
  return 3;
}

export function compareMonthScheduleRepresentativeItems(left: MonthScheduleItem, right: MonthScheduleItem) {
  const priority = representativePriority(left) - representativePriority(right);
  if (priority !== 0) return priority;

  const title = compareStrings(left.title, right.title);
  return title !== 0 ? title : compareStrings(left.id, right.id);
}

export function buildMonthScheduleItems(
  extractedItems: readonly ExtractedItem[],
  calendarEvents: readonly CalendarEvent[],
): MonthScheduleItem[] {
  return [
    ...extractedItems
      .filter((item) => item.reviewStatus === "confirmed")
      .map(extractedItemToMonthScheduleItem),
    ...calendarEvents.map(calendarEventToMonthScheduleItem),
  ].sort(compareMonthScheduleDetailItems);
}

export function buildMonthScheduleDateIndex(items: readonly MonthScheduleItem[]) {
  const index = new Map<string, MonthScheduleItem[]>();

  for (const item of items) {
    const dateItems = index.get(item.date);
    if (dateItems) dateItems.push(item);
    else index.set(item.date, [item]);
  }

  return index;
}

export function getMonthDotCount(itemCount: number) {
  return Math.min(Math.max(0, itemCount), 3);
}

export function getRepresentativeMonthScheduleItem(items: readonly MonthScheduleItem[]) {
  return items.reduce<MonthScheduleItem | undefined>((representative, item) => {
    if (!representative || compareMonthScheduleRepresentativeItems(item, representative) < 0) {
      return item;
    }
    return representative;
  }, undefined);
}
