import type { PlanAdjustment, PlanUpdateRecommendation, PlanningProfile, Todo, WeeklyPlan } from "../domain/types";

const STORAGE_KEY = "catchup.planning.v1";

export interface StoredPlanningState {
  weeklyPlans: WeeklyPlan[];
  todos: Todo[];
  todoIdsByWeeklyPlanId: Record<string, string[]>;
  profile: PlanningProfile;
  adjustmentUsageByDate: Record<string, number>;
  planAdjustments: PlanAdjustment[];
  pendingPlanUpdate: PlanUpdateRecommendation | null;
}

export const emptyPlanningProfile: PlanningProfile = {
  semesterWeekOneStartDate: null,
  confidenceByCourse: {},
  pace: null,
  preparationByEventId: {},
  examGoalByEventId: {},
};

export function readPlanningState(): StoredPlanningState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StoredPlanningState> | null;
    if (!parsed) throw new Error("empty");
    return {
      weeklyPlans: Array.isArray(parsed.weeklyPlans) ? parsed.weeklyPlans : [],
      todos: Array.isArray(parsed.todos) ? parsed.todos.map((todo) => ({
        ...todo,
        durationRationale: todo.durationRationale ?? [],
        carriedOverFromTodoId: todo.carriedOverFromTodoId ?? null,
        recommendationDetails: todo.recommendationDetails ? {
          relatedAcademicEventId: todo.recommendationDetails.relatedAcademicEventId ?? todo.sourceExtractedItemId,
          needReasons: todo.recommendationDetails.needReasons ?? [],
          placementReasons: todo.recommendationDetails.placementReasons ?? [],
          priorityReasons: todo.recommendationDetails.priorityReasons ?? [],
          durationReasons: todo.recommendationDetails.durationReasons ?? [],
          personalizationReasons: todo.recommendationDetails.personalizationReasons ?? [],
          userRequestReasons: todo.recommendationDetails.userRequestReasons ?? [],
          carriedOver: todo.recommendationDetails.carriedOver ?? false,
          provisionalExamStudy: todo.recommendationDetails.provisionalExamStudy ?? false,
        } : undefined,
      })) : [],
      todoIdsByWeeklyPlanId: parsed.todoIdsByWeeklyPlanId ?? {},
      profile: { ...emptyPlanningProfile, ...parsed.profile },
      adjustmentUsageByDate: parsed.adjustmentUsageByDate ?? {},
      planAdjustments: Array.isArray(parsed.planAdjustments) ? parsed.planAdjustments : [],
      pendingPlanUpdate: parsed.pendingPlanUpdate ?? null,
    };
  } catch {
    return { weeklyPlans: [], todos: [], todoIdsByWeeklyPlanId: {}, profile: emptyPlanningProfile, adjustmentUsageByDate: {}, planAdjustments: [], pendingPlanUpdate: null };
  }
}

export function writePlanningState(state: StoredPlanningState) {
  if (!state.weeklyPlans.length && !state.todos.length && !state.planAdjustments.length && !state.pendingPlanUpdate && JSON.stringify(state.profile) === JSON.stringify(emptyPlanningProfile)) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
