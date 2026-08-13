import type { ExtractedItem, PlanningProfile } from "./types";

export interface AcademicWeekRange {
  startDate: string;
  endDate: string;
  source: "academic-event" | "planning-profile";
}

export function addIsoDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function resolveAcademicWeekRange(
  item: Pick<ExtractedItem, "scheduledWeek" | "weekOneStartDate">,
  profile: Pick<PlanningProfile, "semesterWeekOneStartDate">,
): AcademicWeekRange | null {
  if (!item.scheduledWeek) return null;
  const start = item.weekOneStartDate ?? profile.semesterWeekOneStartDate;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const startDate = addIsoDays(start, (item.scheduledWeek - 1) * 7);
  return {
    startDate,
    endDate: addIsoDays(startDate, 6),
    source: item.weekOneStartDate ? "academic-event" : "planning-profile",
  };
}

export function provisionalAcademicEventTitle(title: string) {
  return /\s주$/.test(title) ? title : `${title} 주`;
}
