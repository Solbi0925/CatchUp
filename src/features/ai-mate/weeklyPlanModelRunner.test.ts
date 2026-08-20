import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalBridgeWeeklyPlanRunner } from "./weeklyPlanModelRunner";

const request = {
  mode: "generate" as const,
  attempt: 1 as const,
  input: { planStartDate: "2026-08-19" },
  validationViolations: [],
};

describe("LocalBridgeWeeklyPlanRunner", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a structured weekly-plan response from the dedicated endpoint", async () => {
    const payload = { interpretationSummary: "요약", interpretedConstraints: {}, tasks: [], warnings: [], questions: [] };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    vi.stubGlobal("fetch", fetch);
    await expect(new LocalBridgeWeeklyPlanRunner().execute(request as never)).resolves.toBe(payload);
    expect(fetch).toHaveBeenCalledWith("/api/weekly-plans/generate", expect.objectContaining({ method: "POST" }));
  });

  it("distinguishes invalid JSON, schema-shaped failure, model failure, and timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }));
    await expect(new LocalBridgeWeeklyPlanRunner().execute(request as never)).rejects.toMatchObject({ code: "JSON_PARSE_FAILED" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ warnings: [] }) }));
    await expect(new LocalBridgeWeeklyPlanRunner().execute(request as never)).rejects.toMatchObject({ code: "JSON_SCHEMA_MISMATCH" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "실행 실패" }) }));
    await expect(new LocalBridgeWeeklyPlanRunner().execute(request as never)).rejects.toMatchObject({ code: "MODEL_EXECUTION_FAILED" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 504, json: async () => ({ error: "시간 초과" }) }));
    await expect(new LocalBridgeWeeklyPlanRunner().execute(request as never)).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
  });

  it("explains a stale Local Bridge instead of exposing its raw Not found response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "Not found" }) }));
    await expect(new LocalBridgeWeeklyPlanRunner().execute({ ...request, mode: "adjust" } as never)).rejects.toMatchObject({
      code: "BRIDGE_ENDPOINT_NOT_FOUND",
      message: "Local Bridge가 현재 주간계획 API를 제공하지 않아요. 개발 서버를 다시 시작해주세요.",
    });
  });
});
