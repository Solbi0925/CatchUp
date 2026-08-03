export const CALENDAR_CATEGORY_COLORS = [
  "#C7B9FA",
  "#E9E0FF",
  "#F8B1FB",
  "#FEE8FF",
  "#A5D1FF",
  "#D9F0FF",
] as const;

export type CalendarCategoryColor = (typeof CALENDAR_CATEGORY_COLORS)[number];

export const PERSONAL_CATEGORY_KEY = "personal";

export function getCourseCategoryKey(courseName: string) {
  return `course:${courseName.trim()}`;
}

export function getDefaultCategoryColor(categoryKey: string): CalendarCategoryColor {
  let hash = 0;
  for (const character of categoryKey) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return CALENDAR_CATEGORY_COLORS[hash % CALENDAR_CATEGORY_COLORS.length];
}

export function resolveCategoryColor(
  categoryKey: string,
  overrides: Readonly<Record<string, CalendarCategoryColor>>,
) {
  return overrides[categoryKey] ?? getDefaultCategoryColor(categoryKey);
}
