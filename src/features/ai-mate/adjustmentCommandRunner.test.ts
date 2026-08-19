import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalBridgeAdjustmentCommandRunner } from "./adjustmentCommandRunner";

const request = { operationId: "adjust-1", attempt: 1 as const, input: { planStartDate: "2026-08-19" }, validationErrors: [] };

describe("LocalBridgeAdjustmentCommandRunner", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the compact adjustment endpoint and returns operations instead of tasks", async () => {
    const payload = { interpretationSummary: "금요일을 가볍게 합니다.", operations: [], constraints: { maxDailyMinutes: null, maxTasksByWeekday: [], prohibitedWeekdays: [], preferredWeekdays: [] }, warnings: [], questions: [] };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }); vi.stubGlobal("fetch", fetch);
    await expect(new LocalBridgeAdjustmentCommandRunner().execute(request as never)).resolves.toBe(payload);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/weekly-plans/adjust");
    expect(JSON.parse(options.body)).not.toHaveProperty("mode");
    expect(payload).not.toHaveProperty("tasks");
  });

  it("does not include user content in diagnostic logs", async () => {
    const secretRequest = { ...request, input: { planStartDate: "2026-08-19", userRequest: "민감한 요청 원문" } };
    const payload = { interpretationSummary: "질문", operations: [], constraints: { maxDailyMinutes: null, maxTasksByWeekday: [], prohibitedWeekdays: [], preferredWeekdays: [] }, warnings: [], questions: ["대상을 알려주세요."] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await new LocalBridgeAdjustmentCommandRunner().execute(secretRequest as never);
    expect(JSON.stringify(info.mock.calls)).not.toContain("민감한 요청 원문");
  });

  it("maps a stopped Local Bridge to an actionable message instead of exposing Failed to fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(new LocalBridgeAdjustmentCommandRunner().execute(request as never)).rejects.toMatchObject({
      code: "BRIDGE_UNAVAILABLE",
      message: "Local Bridge에 연결하지 못했어요. 개발 서버 실행 상태를 확인한 뒤 다시 시도해주세요.",
    });
  });
});
