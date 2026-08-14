import { describe, expect, it } from "vitest";
import { currentTodayDate } from "./clock";

describe("currentTodayDate", () => {
  it("uses the actual Asia/Seoul calendar date instead of a demo constant", () => {
    expect(currentTodayDate(new Date("2026-08-13T15:30:00Z"))).toBe("2026-08-14");
  });
});
