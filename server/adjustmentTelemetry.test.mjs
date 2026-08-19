import { describe, expect, it, vi } from "vitest";
import { logAdjustmentPerformance } from "./adjustmentTelemetry.mjs";

describe("adjustment performance logging", () => {
  it("keeps diagnostic metadata and drops request or academic content", () => {
    const sink = vi.fn();
    logAdjustmentPerformance({ operationId: "adjust-1", mode: "adjust", totalMs: 42, result: "success", userRequest: "실제 요청", calendarTitle: "개인 일정", academicMaterial: "자료 전문" }, sink);
    expect(sink).toHaveBeenCalledWith("[catchup:adjust]", { operationId: "adjust-1", mode: "adjust", totalMs: 42, result: "success" });
    expect(JSON.stringify(sink.mock.calls)).not.toContain("실제 요청");
  });
});
