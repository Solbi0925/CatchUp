import { adjustPlanDeterministically } from "../../application/deterministicPlanAdjuster";
import { generateMockWeeklyPlan } from "../../application/mockPlanEngine";
import { parsePlanConstraints } from "../../application/planConstraints";
import { updateMockPlan } from "../../application/updatePlan";
import type { AiPlanDraft, AiPlanModelRequest, WeeklyPlanModelRunner } from "../../application/aiPlanOrchestrator";
import type { ExtractedItem, GeneratePlanCommand, Todo, WeeklyPlan } from "../../domain/types";

const endpointByMode = {
  generate: "/api/weekly-plans/generate",
  update: "/api/weekly-plans/update",
  adjust: "/api/weekly-plans/adjust",
} as const;

export class WeeklyPlanModelError extends Error {
  constructor(public readonly code: "MODEL_EXECUTION_FAILED" | "MODEL_TIMEOUT" | "JSON_PARSE_FAILED" | "JSON_SCHEMA_MISMATCH" | "BRIDGE_ENDPOINT_NOT_FOUND" | "BRIDGE_UNAVAILABLE", message: string) {
    super(message);
    this.name = "WeeklyPlanModelError";
  }
}

export class LocalBridgeWeeklyPlanRunner implements WeeklyPlanModelRunner {
  async execute(request: AiPlanModelRequest): Promise<AiPlanDraft> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 125_000);
    try {
      const response = await fetch(endpointByMode[request.mode], {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: `weekly-${Date.now()}`, ...request }), signal: controller.signal,
      });
      let payload: AiPlanDraft | { error?: string } | null;
      try { payload = await response.json() as AiPlanDraft | { error?: string }; }
      catch { throw new WeeklyPlanModelError("JSON_PARSE_FAILED", "AI 주간계획 응답을 JSON으로 해석하지 못했어요."); }
      if (response.status === 404) throw new WeeklyPlanModelError("BRIDGE_ENDPOINT_NOT_FOUND", "Local Bridge가 현재 주간계획 API를 제공하지 않아요. 개발 서버를 다시 시작해주세요.");
      if (!response.ok) throw new WeeklyPlanModelError(response.status === 504 ? "MODEL_TIMEOUT" : "MODEL_EXECUTION_FAILED", payload && "error" in payload ? payload.error ?? "AI 주간계획 모델 실행에 실패했어요." : "AI 주간계획 모델 실행에 실패했어요.");
      if (!payload || !("tasks" in payload)) throw new WeeklyPlanModelError("JSON_SCHEMA_MISMATCH", "AI 주간계획 응답이 필요한 구조를 포함하지 않습니다.");
      return payload;
    } finally { window.clearTimeout(timer); }
  }
}

function interpreted(requestText: string): AiPlanDraft["interpretedConstraints"] {
  const parsed = parsePlanConstraints(requestText);
  return {
    maxDailyMinutes: parsed.maxDailyMinutes,
    maxTasksByWeekday: Object.entries(parsed.maxTasksByWeekday).flatMap(([weekday, maxTasks]) => maxTasks === undefined ? [] : [{ weekday: Number(weekday), maxTasks }]),
    prohibitedWeekdays: parsed.prohibitedWeekdays,
    lightStudyWeekdays: Object.entries(parsed.maxMinutesByWeekday).filter(([, minutes]) => minutes !== undefined && minutes <= 60).map(([day]) => Number(day)),
    preferredStudyWeekdaysByEventId: [], blockedTimeRanges: [],
  };
}

function toDraft(todos: Todo[], command: GeneratePlanCommand, summary: string): AiPlanDraft {
  const included = new Set(todos.map((todo) => todo.id));
  return {
    interpretationSummary: summary,
    interpretedConstraints: interpreted(command.requestText),
    tasks: todos.filter((todo) => !todo.isCompleted).map((todo) => ({
      clientTaskKey: todo.id, sourceAcademicEventId: todo.sourceExtractedItemId, title: todo.title, todoType: todo.todoType,
      scheduledDate: todo.scheduledDate, startTime: todo.startTime ?? null, estimatedDurationMinutes: todo.estimatedDurationMinutes,
      priority: todo.priority, taskPhase: todo.taskPhase ?? null,
      dependsOnClientTaskKey: todo.dependsOnTodoId && included.has(todo.dependsOnTodoId) ? todo.dependsOnTodoId : null,
      carriedOverFromTodoId: todo.carriedOverFromTodoId,
      recommendation: {
        needReasons: todo.recommendationDetails?.needReasons ?? ["학업 일정 준비"],
        placementReasons: todo.recommendationDetails?.placementReasons ?? [todo.recommendationReason],
        priorityReasons: todo.recommendationDetails?.priorityReasons ?? ["마감과 작업량 고려"],
        durationReasons: todo.recommendationDetails?.durationReasons ?? todo.durationRationale,
        personalizationReasons: todo.recommendationDetails?.personalizationReasons ?? [],
        userRequestReasons: todo.recommendationDetails?.userRequestReasons ?? [command.requestText],
      },
    })),
    warnings: [], questions: [],
  };
}

/** Tests never execute Codex. This runner adapts the old deterministic engine into a model stub only. */
class LegacyFakeWeeklyPlanRunner implements WeeklyPlanModelRunner {
  constructor(private readonly command: GeneratePlanCommand, private readonly plan: WeeklyPlan | null, private readonly todos: Todo[], private readonly affectedIds: string[], private readonly previousEvents: ExtractedItem[]) {}
  async execute(request: AiPlanModelRequest) {
    if (request.mode === "generate") {
      const result = generateMockWeeklyPlan(this.command);
      return toDraft(result.todos, this.command, "테스트 Fake 모델이 생성한 주간계획입니다.");
    }
    if (!this.plan) return toDraft([], this.command, "현재 계획이 없습니다.");
    if (request.mode === "update") {
      const result = updateMockPlan({ command: this.command, weeklyPlan: this.plan, todos: this.todos, affectedAcademicEventIds: this.affectedIds, previousAcademicEvents: this.previousEvents });
      const affected = this.affectedIds.length
        ? new Set(this.affectedIds)
        : new Set(result.todos.filter((todo) => (result.changedTodoIds ?? []).includes(todo.id)).map((todo) => todo.sourceExtractedItemId));
      return toDraft(result.todos.filter((todo) => !todo.isCompleted && affected.has(todo.sourceExtractedItemId)), this.command, result.assistantMessage.text);
    }
    const result = adjustPlanDeterministically({ operationId: this.command.operationId, requestText: this.command.requestText, requestedAt: this.command.requestedAt, weeklyPlan: this.plan, todos: this.todos, academicEvents: this.command.extractedItems, calendarEvents: this.command.calendarEvents, maxDailyStudyMinutes: this.command.planningProfile.maxDailyStudyMinutes });
    return toDraft(result.todos.filter((todo) => !todo.isCompleted), this.command, result.assistantMessage.text);
  }
}

export function createWeeklyPlanModelRunner(input: { command: GeneratePlanCommand; plan?: WeeklyPlan | null; todos?: Todo[]; affectedIds?: string[]; previousEvents?: ExtractedItem[] }): WeeklyPlanModelRunner {
  return import.meta.env.MODE === "test"
    ? new LegacyFakeWeeklyPlanRunner(input.command, input.plan ?? null, input.todos ?? [], input.affectedIds ?? [], input.previousEvents ?? [])
    : new LocalBridgeWeeklyPlanRunner();
}
