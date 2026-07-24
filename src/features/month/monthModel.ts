export interface UtcMonthParts {
  year: number;
  month: number;
}

export interface UtcDateParts extends UtcMonthParts {
  day: number;
}

export interface MonthGridCell {
  date: string;
  isCurrentMonth: boolean;
}

export interface CanonicalMonthQuery {
  month: string;
  date: string;
}

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 0;
const MAX_YEAR = 9_999;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function createUtcDate({ year, month, day }: UtcDateParts) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function daysInMonth(year: number, month: number) {
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month, 0);
  lastDay.setUTCHours(0, 0, 0, 0);
  return lastDay.getUTCDate();
}

function hasValidMonthParts({ year, month }: UtcMonthParts) {
  return (
    Number.isInteger(year) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}

function hasValidDateParts(parts: UtcDateParts) {
  return (
    hasValidMonthParts(parts) &&
    Number.isInteger(parts.day) &&
    parts.day >= 1 &&
    parts.day <= daysInMonth(parts.year, parts.month)
  );
}

function hasCompleteMonthGrid({ year, month }: UtcMonthParts) {
  if (!hasValidMonthParts({ year, month })) return false;

  const firstOfMonth = createUtcDate({ year, month, day: 1 });
  const leadingDays = firstOfMonth.getUTCDay();
  const weeks = Math.ceil((leadingDays + daysInMonth(year, month)) / 7);
  const trailingDays = weeks * 7 - leadingDays - daysInMonth(year, month);

  return !(year === MIN_YEAR && leadingDays > 0) && !(year === MAX_YEAR && trailingDays > 0);
}

export function parseCanonicalMonth(value: string | null | undefined): UtcMonthParts | null {
  const match = value?.match(MONTH_KEY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function parseCanonicalDate(value: string | null | undefined): UtcDateParts | null {
  const match = value?.match(DATE_KEY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

export function formatMonthKey({ year, month }: UtcMonthParts) {
  if (!hasValidMonthParts({ year, month })) return null;
  return `${String(year).padStart(4, "0")}-${pad(month)}`;
}

export function formatDateKey({ year, month, day }: UtcDateParts) {
  if (!hasValidDateParts({ year, month, day })) return null;
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

export function shiftMonth(monthKey: string, amount: number) {
  const month = parseCanonicalMonth(monthKey);
  if (!month || !Number.isInteger(amount)) return monthKey;

  const absoluteMonth = month.year * 12 + (month.month - 1) + amount;
  const year = Math.floor(absoluteMonth / 12);
  const nextMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  return formatMonthKey({ year, month: nextMonth }) ?? monthKey;
}

export function buildMonthGrid(monthKey: string): MonthGridCell[] {
  const month = parseCanonicalMonth(monthKey);
  if (!month || !hasCompleteMonthGrid(month)) return [];

  const firstOfMonth = createUtcDate({ ...month, day: 1 });
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - firstOfMonth.getUTCDay());

  const weeks = Math.ceil((firstOfMonth.getUTCDay() + daysInMonth(month.year, month.month)) / 7);

  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const parts = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
    const dateKey = formatDateKey(parts);
    if (!dateKey) {
      throw new Error("Month grid generated a date outside the supported range");
    }
    return {
      date: dateKey,
      isCurrentMonth: parts.year === month.year && parts.month === month.month,
    };
  });
}

export function resolveMonthQuery(
  query: URLSearchParams,
  fallbackDate: string,
): CanonicalMonthQuery {
  const fallback = parseCanonicalDate(fallbackDate);
  if (!fallback || !hasCompleteMonthGrid(fallback)) {
    throw new Error("fallbackDate must belong to a complete canonical UTC month grid");
  }

  const month = parseCanonicalMonth(query.get("month"));
  const date = parseCanonicalDate(query.get("date"));
  return {
    month: formatMonthKey(month && hasCompleteMonthGrid(month) ? month : fallback)!,
    date: formatDateKey(date && hasCompleteMonthGrid(date) ? date : fallback)!,
  };
}
