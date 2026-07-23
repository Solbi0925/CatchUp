import type {
  ExtractedItem,
  PlanPrerequisiteResult,
  PlanWeekWindow,
  UploadedDocument,
  User,
  WeeklyPlan,
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

export function getPlanWeekWindow(now: Date): PlanWeekWindow {
  const parts = dateParts(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[parts.weekday] ?? 0;
  const localMidnightAsUtc = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  const daysUntilMonday = weekday === 0 ? 1 : 8 - weekday;
  const monday = addUtcDays(localMidnightAsUtc, daysUntilMonday);
  return {
    weekStartDate: toIsoDate(monday),
    weekEndDate: toIsoDate(addUtcDays(monday, 6)),
    referenceWindowEndDate: toIsoDate(addUtcDays(monday, 27)),
  };
}

function isAtConfiguredGenerationTime(user: User, now: Date) {
  const parts = dateParts(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const [scheduledHour, scheduledMinute] = user.weeklyPlanGenerationTime
    .split(":")
    .map(Number);
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
  return weekdayMap[parts.weekday] === user.weeklyPlanGenerationDay && currentMinutes >= scheduledMinutes;
}

export function validatePlanPrerequisites(input: {
  user: User;
  documents: UploadedDocument[];
  extractedItems: ExtractedItem[];
  existingWeeklyPlan: WeeklyPlan | null;
  now: Date;
}): PlanPrerequisiteResult {
  if (!isAtConfiguredGenerationTime(input.user, input.now)) {
    return { ok: false, reason: "not-scheduled" };
  }
  if (input.documents.length === 0 || input.extractedItems.length === 0) {
    return { ok: false, reason: "no-upload" };
  }
  if (input.user.calendarConnectionStatus !== "connected") {
    return { ok: false, reason: "calendar-disconnected" };
  }
  if (input.extractedItems.some((item) => item.reviewStatus === "needs-review")) {
    return { ok: false, reason: "needs-review" };
  }
  if (input.existingWeeklyPlan) {
    return { ok: false, reason: "already-generated" };
  }
  return { ok: true };
}
