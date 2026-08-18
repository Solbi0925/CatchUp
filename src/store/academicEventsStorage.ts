import { assessAcademicEventConfirmation } from "../domain/academicEventStatus";
import type { ExtractedItem } from "../domain/types";

const STORAGE_KEY = "catchup.academic-events.v2";
const LEGACY_STORAGE_KEY = "catchup.confirmed-academic-events.v1";

function isStoredAcademicEvent(item: unknown): item is ExtractedItem {
  return typeof item === "object" && item !== null &&
    typeof (item as ExtractedItem).id === "string" &&
    typeof (item as ExtractedItem).title === "string" &&
    typeof (item as ExtractedItem).courseName === "string";
}

function migrateAcademicEvent(item: ExtractedItem): ExtractedItem {
  const legacyItemType = item.itemType as string;
  const itemType: ExtractedItem["itemType"] = legacyItemType === "deadline" || legacyItemType === "submission"
    ? "assignment"
    : legacyItemType === "notice"
      ? "other"
      : item.itemType;
  const migrated = {
    ...item,
    itemType,
    scheduledWeek: item.scheduledWeek ?? null,
    scheduledWeekLabel: item.scheduledWeekLabel ?? null,
    weekOneStartDate: item.weekOneStartDate ?? null,
    classMeetingTimes: item.classMeetingTimes ?? [],
    dateCertainty: item.dateCertainty ?? (item.date ? "exact-date" : item.scheduledWeek ? "academic-week" : "unknown"),
    confirmationStatus: item.confirmationStatus ?? "unconfirmed",
    confirmationIssues: item.confirmationIssues ?? [],
    revision: item.revision ?? 1,
    updateNoticeStatus: item.updateNoticeStatus ?? "reviewed",
    updatedAt: item.updatedAt ?? new Date(0).toISOString(),
  };
  return { ...migrated, ...assessAcademicEventConfirmation(migrated) };
}

export function readAcademicEvents(): ExtractedItem[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAcademicEvent).map(migrateAcademicEvent);
  } catch {
    return [];
  }
}

export function writeAcademicEvents(items: readonly ExtractedItem[]) {
  if (items.length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}
