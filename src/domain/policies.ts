import type {
  ExtractedItem,
  PlanPrerequisiteResult,
  PlanWindow,
  UploadedDocument,
  User,
} from "./types";

const TIME_ZONE = "Asia/Seoul";

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toIsoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isSupportedAcademicFile(file: Pick<File, "type">) {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export function getPlanWindow(now: Date): PlanWindow {
  const parts = dateParts(now);
  const localMidnightAsUtc = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  return {
    planStartDate: toIsoDate(localMidnightAsUtc),
    planEndDate: toIsoDate(addUtcDays(localMidnightAsUtc, 6)),
    referenceWindowEndDate: toIsoDate(addUtcDays(localMidnightAsUtc, 27)),
  };
}

export function validatePlanPrerequisites(input: {
  user: User;
  documents: UploadedDocument[];
  extractedItems: ExtractedItem[];
}): PlanPrerequisiteResult {
  if (input.documents.length === 0 || input.extractedItems.length === 0) {
    return { ok: false, reason: "no-upload" };
  }
  if (input.user.calendarConnectionStatus !== "connected") {
    return { ok: false, reason: "calendar-disconnected" };
  }
  if (input.extractedItems.some((item) => item.reviewStatus === "needs-review")) {
    return { ok: false, reason: "needs-review" };
  }
  return { ok: true };
}
