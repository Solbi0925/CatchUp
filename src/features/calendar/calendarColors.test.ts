import { describe, expect, it } from "vitest";
import {
  CALENDAR_CATEGORY_COLORS,
  getCourseCategoryKey,
  getDefaultCategoryColor,
  resolveCategoryColor,
} from "./calendarColors";

describe("calendar category colors", () => {
  it("uses only the approved six-color palette", () => {
    expect(CALENDAR_CATEGORY_COLORS).toEqual([
      "#C7B9FA",
      "#E9E0FF",
      "#F8B1FB",
      "#FEE8FF",
      "#A5D1FF",
      "#D9F0FF",
    ]);
  });

  it("resolves one stable color per course and honors category overrides", () => {
    const categoryKey = getCourseCategoryKey("데이터베이스");

    expect(categoryKey).toBe("course:데이터베이스");
    expect(resolveCategoryColor(categoryKey, {})).toBe(
      getDefaultCategoryColor(categoryKey),
    );
    expect(
      resolveCategoryColor(categoryKey, {
        [categoryKey]: "#A5D1FF",
      }),
    ).toBe("#A5D1FF");
  });
});
