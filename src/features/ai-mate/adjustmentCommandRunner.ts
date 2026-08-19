import type { AdjustmentCommandDraft, AdjustmentCommandRunner, AdjustmentModelRequest } from "../../application/planAdjustment";
import { WeeklyPlanModelError } from "./weeklyPlanModelRunner";

const nowMs = () => typeof performance === "undefined" ? Date.now() : performance.now();

export class LocalBridgeAdjustmentCommandRunner implements AdjustmentCommandRunner {
  async execute(request: AdjustmentModelRequest): Promise<AdjustmentCommandDraft> {
    const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 125_000);
    const body = JSON.stringify(request); const started = nowMs();
    console.info("[catchup:adjust]", { operationId: request.operationId, mode: "adjust", attempt: request.attempt, stage: "client-request", inputBytes: new TextEncoder().encode(body).length, fastPath: false });
    try {
      const response = await fetch("/api/weekly-plans/adjust", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
      const parseStarted = nowMs(); let payload: AdjustmentCommandDraft | { error?: string } | null;
      try { payload = await response.json() as AdjustmentCommandDraft | { error?: string }; }
      catch { throw new WeeklyPlanModelError("JSON_PARSE_FAILED", "AI 변경 명령 응답을 JSON으로 해석하지 못했어요."); }
      const parseMs = Math.round(nowMs() - parseStarted);
      console.info("[catchup:adjust]", { operationId: request.operationId, mode: "adjust", attempt: request.attempt, stage: "client-response", totalMs: Math.round(nowMs() - started), jsonParseMs: parseMs, status: response.status, fastPath: false });
      if (response.status === 404) throw new WeeklyPlanModelError("BRIDGE_ENDPOINT_NOT_FOUND", "Local Bridge가 현재 조정 명령 API를 제공하지 않아요. 개발 서버를 다시 시작해주세요.");
      if (!response.ok) throw new WeeklyPlanModelError(response.status === 504 ? "MODEL_TIMEOUT" : "MODEL_EXECUTION_FAILED", payload && "error" in payload ? payload.error ?? "AI 변경 명령 실행에 실패했어요." : "AI 변경 명령 실행에 실패했어요.");
      if (!payload || !("operations" in payload) || !Array.isArray(payload.operations)) throw new WeeklyPlanModelError("JSON_SCHEMA_MISMATCH", "AI 변경 명령 응답이 필요한 구조를 포함하지 않습니다.");
      return payload;
    } catch (error) {
      if (error instanceof WeeklyPlanModelError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new WeeklyPlanModelError("MODEL_TIMEOUT", "AI 조정 명령 해석 시간이 초과됐어요. 기존 계획은 유지됩니다.");
      if (error instanceof TypeError) throw new WeeklyPlanModelError("BRIDGE_UNAVAILABLE", "Local Bridge에 연결하지 못했어요. 개발 서버 실행 상태를 확인한 뒤 다시 시도해주세요.");
      throw error;
    } finally { window.clearTimeout(timer); }
  }
}

export function createAdjustmentCommandRunner(): AdjustmentCommandRunner {
  return new LocalBridgeAdjustmentCommandRunner();
}
