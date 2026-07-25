export interface MonthGridCell {
  date: string;
  isCurrentMonth: boolean;
}

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

export function parseCanonicalMonth(monthKey: string) {
  const match = monthKey.match(monthPattern);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

export function shiftMonth(monthKey: string, amount: number) {
  const month = parseCanonicalMonth(monthKey);
  if (!month) return monthKey;
  const date = new Date(Date.UTC(month.year, month.month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function buildMonthGrid(monthKey: string): MonthGridCell[] {
  const month = parseCanonicalMonth(monthKey);
  if (!month) return [];

  const firstDay = new Date(Date.UTC(month.year, month.month - 1, 1));
  const lastDay = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const leadingDays = firstDay.getUTCDay();
  const cellCount = Math.ceil((leadingDays + lastDay) / 7) * 7;
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(1 - leadingDays);

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return {
      date: dateKey(date),
      isCurrentMonth:
        date.getUTCFullYear() === month.year &&
        date.getUTCMonth() === month.month - 1,
    };
  });
}
