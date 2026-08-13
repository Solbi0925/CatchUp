import { describe, expect, it } from "vitest";
import { analysisTimeoutMs } from "./analysisLimits.mjs";

describe("academic analysis timeout", () => {
  it("gives multi-file analysis enough time while keeping an upper bound", () => {
    expect(analysisTimeoutMs(1)).toBe(5 * 60_000);
    expect(analysisTimeoutMs(5)).toBe(13 * 60_000);
    expect(analysisTimeoutMs(100)).toBe(20 * 60_000);
  });
});
