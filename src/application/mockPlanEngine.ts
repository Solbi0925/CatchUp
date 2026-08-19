import { getPlanWeekWindow } from "../domain/policies";
import type {
  ExtractedItem,
  GeneratePlanCommand,
  GeneratePlanResult,
  PlanningProfile,
  Todo,
  WeeklyPlan,
} from "../domain/types";
import { effectiveDailyStudyCapacity, parsePlanConstraints, rebalancePlanToConstraints, scheduledMinutesByDate, taskMinutesByDate } from "./planConstraints";

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function todoType(item: ExtractedItem): Todo["todoType"] {
  if (item.itemType === "exam" || item.itemType === "quiz") return "exam-study";
  if (item.itemType === "class-schedule") return "class-prep";
  return "assignment-work";
}

function baseMinutes(item: ExtractedItem) {
  if (item.estimatedDurationMinutes) return item.estimatedDurationMinutes;
  if (item.itemType === "exam" || item.itemType === "quiz") return item.examScope ? 240 : 120;
  if (item.assignmentType === "coding") return 210;
  if (item.assignmentType === "report" || item.assignmentType === "essay") return 180;
  if (item.itemType === "presentation" || item.itemType === "team-project") return 180;
  return 120;
}

export function estimatePersonalizedDuration(item: ExtractedItem, profile: PlanningProfile) {
  let minutes = baseMinutes(item);
  const rationale = [item.estimatedDurationMinutes ? "자료에 저장된 예상 작업량" : `자료에서 확인한 ${item.itemType} 작업 특성`];
  if (item.workload) rationale.push(`분량: ${item.workload}`);
  if (item.researchNeeded === "high") { minutes *= 1.25; rationale.push("자료 조사가 많이 필요함"); }
  if (item.difficulty === "high") { minutes *= 1.2; rationale.push("객관적 난이도가 높음"); }
  const confidence = profile.confidenceByCourse[item.courseName];
  if (confidence === "low") { minutes *= 1.25; rationale.push("사용자가 과목 자신감을 낮게 응답함"); }
  if (confidence === "high") { minutes *= .85; rationale.push("사용자가 과목 자신감을 높게 응답함"); }
  if (profile.pace === "slow") { minutes *= 1.2; rationale.push("사용자가 작업 속도를 여유 있게 응답함"); }
  if (profile.pace === "fast") { minutes *= .85; rationale.push("사용자가 작업 속도를 빠르게 응답함"); }
  const preparation = profile.preparationByEventId[item.id];
  if (preparation === "review-needed") { minutes *= 1.2; rationale.push("관련 개념 복습이 필요함"); }
  if (preparation === "restart-needed") { minutes *= 1.45; rationale.push("기초부터 다시 학습할 필요가 있음"); }
  const examGoal = profile.examGoalByEventId[item.id];
  if (examGoal === "a") { minutes *= 1.25; rationale.push("시험 목표가 A 수준임"); }
  if (examGoal === "pass") { minutes *= .8; rationale.push("시험 목표가 Pass 수준임"); }
  return { minutes: Math.max(30, Math.round(minutes / 15) * 15), rationale };
}

function priorityScore(item: ExtractedItem, startDate: string, estimatedMinutes: number, request: string, carryOver: boolean) {
  const days = item.date ? differenceInDays(startDate, item.date) : 28;
  let score = Math.max(0, 30 - days) + Math.min(12, estimatedMinutes / 30);
  if (item.itemType === "exam" || item.itemType === "quiz") score += 9;
  if (item.difficulty === "high") score += 5;
  if (carryOver) score += 8;
  if (request.includes(item.courseName) || (/시험.*우선/.test(request) && item.itemType === "exam")) score += 12;
  return score;
}

function todoTitle(item: ExtractedItem, index: number, total: number) {
  if (item.itemType === "exam" || item.itemType === "quiz") {
    if (item.examScope) return index === total - 1 ? `${item.title} 범위 전체 점검하기` : `${item.title} 범위 복습하기`;
    return index === total - 1 ? `${item.title} 현재까지 학습 내용 점검하기` : `${item.title} 현재까지 수업 내용 복습하기`;
  }
  if (total === 1) return `${item.title} 진행하기`;
  if (index === 0) return `${item.title} 요구사항과 자료 정리하기`;
  if (index === total - 1) return `${item.title} 검토하고 마무리하기`;
  return `${item.title} 이어서 진행하기`;
}

function phaseFor(index: number, total: number): Todo["taskPhase"] {
  if (total === 1) return "work";
  if (index === 0) return "research";
  if (index === total - 1) return "finalize";
  return "work";
}

export function scheduleAcademicEventTodos(
  command: GeneratePlanCommand,
  items: ExtractedItem[],
  plan: Pick<WeeklyPlan, "weekStartDate" | "weekEndDate">,
  weeklyPlanId: string,
  baselineTodos: Todo[] = [],
  completedWorkflowTodos: Todo[] = [],
) {
  const constraints = parsePlanConstraints(command.requestText);
  // 이월 후보는 4주 AcademicEvent 조회와 분리하고, 아직 유효한 원본 일정의 미완료 항목만 인정한다.
  const itemById = new Map(command.extractedItems.map((item) => [item.id, item]));
  const validCarryOvers = command.existingIncompleteTodos.filter((todo) => {
    const source = itemById.get(todo.sourceExtractedItemId);
    return !todo.isCompleted && Boolean(source) && source!.confirmationStatus === "confirmed"
      && (source!.itemType === "class-schedule" || !source!.date || source!.date >= plan.weekStartDate);
  });
  const carriedByEvent = new Map(validCarryOvers.map((todo) => [todo.sourceExtractedItemId, todo]));
  const ranked = items.map((item) => {
    const estimate = estimatePersonalizedDuration(item, command.planningProfile);
    const carried = carriedByEvent.get(item.id);
    return { item, estimate, carried, score: priorityScore(item, plan.weekStartDate, estimate.minutes, command.requestText, Boolean(carried)) };
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const taskLoads = taskMinutesByDate(baselineTodos);
  const taskCounts = new Map<string, number>();
  baselineTodos.filter((todo) => !todo.isCompleted).forEach((todo) => taskCounts.set(todo.scheduledDate, (taskCounts.get(todo.scheduledDate) ?? 0) + 1));
  const scheduledLoads = scheduledMinutesByDate(plan, command.calendarEvents, command.extractedItems);
  const todos: Todo[] = [];
  const violations: string[] = [];
  const dates = Array.from({ length: 7 }, (_, day) => addDays(plan.weekStartDate, day));
  const profileMaximum = command.planningProfile.maxDailyStudyMinutes ?? 240;

  for (const { item, estimate, carried, score } of ranked) {
    const daysUntilDeadline = item.date ? differenceInDays(plan.weekStartDate, item.date) : 28;
    const fullMinutes = carried ? Math.max(estimate.minutes, carried.estimatedDurationMinutes) : estimate.minutes;
    // 4주는 후보를 보는 범위일 뿐이다. 이번 주보다 먼 작업은 남은 주 수로 나눈 초기 분량만 선택한다.
    const totalMinutes = daysUntilDeadline > 7
      ? Math.max(30, Math.ceil(fullMinutes / Math.ceil(daysUntilDeadline / 7) / 15) * 15)
      : fullMinutes;
    const possibleDays = item.date ? Math.max(0, Math.min(7, differenceInDays(plan.weekStartDate, item.date))) : 7;
    if (possibleDays === 0) { violations.push(`${item.title}: 마감 전에 배치할 날짜가 없음`); continue; }
    const availableChunk = Math.min(90, Math.max(0, ...dates.map((date) =>
      effectiveDailyStudyCapacity(date, constraints, scheduledLoads, profileMaximum) - (taskLoads.get(date) ?? 0),
    )));
    const chunkMaximum = Math.floor(availableChunk / 15) * 15;
    if (chunkMaximum < 15) {
      if (daysUntilDeadline > 7) continue;
      violations.push(`${item.title}: 이번 주 실제 학습 가능 시간이 부족함`);
      continue;
    }
    const chunks = Math.ceil(totalMinutes / chunkMaximum);
    if (chunks > possibleDays) {
      if (daysUntilDeadline > 7) continue;
      violations.push(`${item.title}: 예상 소요시간을 줄이지 않고 마감 전에 나눠 배치할 날짜가 부족함`);
      continue;
    }
    const todoCheckpoint = todos.length;
    const taskLoadCheckpoint = new Map(taskLoads);
    const taskCountCheckpoint = new Map(taskCounts);
    let remaining = totalMinutes;
    let predecessor: Todo | undefined;
    let eventFailed = false;
    for (let index = 0; index < chunks; index += 1) {
      const minutes = Math.min(chunkMaximum, Math.ceil(remaining / (chunks - index) / 15) * 15);
      remaining -= minutes;
      const title = todoTitle(item, index, chunks);
      const completedPhase = completedWorkflowTodos.find((todo) => todo.sourceExtractedItemId === item.id && todo.title === title);
      if (completedPhase) { predecessor = completedPhase; continue; }
      const remainingPhases = chunks - index - 1;
      const candidates = dates.filter((date) => {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const deadlineRoom = !item.date || differenceInDays(date, item.date) > remainingPhases;
        const taskLimit = constraints.maxTasksByWeekday[weekday];
        return date <= plan.weekEndDate && deadlineRoom && (!predecessor || date > predecessor.scheduledDate)
          && !constraints.prohibitedWeekdays.includes(weekday)
          && (taskLimit === undefined || (taskCounts.get(date) ?? 0) < taskLimit)
          && (taskLoads.get(date) ?? 0) + minutes <= effectiveDailyStudyCapacity(date, constraints, scheduledLoads, profileMaximum);
      }).sort((left, right) => {
        const leftPreferred = constraints.preferredWeekdays.includes(new Date(`${left}T00:00:00Z`).getUTCDay());
        const rightPreferred = constraints.preferredWeekdays.includes(new Date(`${right}T00:00:00Z`).getUTCDay());
        return Number(!leftPreferred) - Number(!rightPreferred)
          || ((taskLoads.get(left) ?? 0) + (scheduledLoads.get(left) ?? 0)) - ((taskLoads.get(right) ?? 0) + (scheduledLoads.get(right) ?? 0))
          || left.localeCompare(right);
      });
      const scheduledDate = candidates[0];
      if (!scheduledDate) { eventFailed = true; break; }
      const taskMinutes = taskLoads.get(scheduledDate) ?? 0;
      const occupiedMinutes = scheduledLoads.get(scheduledDate) ?? 0;
      const selectedLoad = taskMinutes + occupiedMinutes;
      const heavierAlternative = dates.filter((date) => date !== scheduledDate && (!item.date || date < item.date))
        .map((date) => ({ date, minutes: (taskLoads.get(date) ?? 0) + (scheduledLoads.get(date) ?? 0) }))
        .filter((candidate) => candidate.minutes > selectedLoad).sort((a, b) => b.minutes - a.minutes || a.date.localeCompare(b.date))[0];
      const placementReasons = [
        `${scheduledDate}의 기존 할 일 ${taskMinutes}분 + 예정 일정 ${occupiedMinutes}분을 비교함`,
        ...(heavierAlternative ? [`${heavierAlternative.date}의 총 부담 ${heavierAlternative.minutes}분보다 여유가 있음`] : []),
        predecessor ? `${predecessor.title} 이후 단계로 배치함` : "같은 이벤트의 첫 작업 단계로 배치함",
      ];
      const id = `todo-${command.operationId}-${item.id}-${index}`;
      const todo: Todo = {
        id, weeklyPlanId, sourceExtractedItemId: item.id, scheduledDate,
        title, todoType: todoType(item), courseName: item.courseName,
        estimatedDurationMinutes: minutes, priority: score >= 28 ? "high" : score >= 16 ? "medium" : "low",
        isCompleted: false,
        recommendationReason: `${placementReasons.join(". ")}. 마감과 작업 순서를 지켜 배치했어요.`,
        durationRationale: estimate.rationale, carriedOverFromTodoId: carried?.id ?? null,
        taskPhase: daysUntilDeadline > 7 && chunks === 1 ? "research" : phaseFor(index, chunks), dependsOnTodoId: predecessor?.id ?? null,
        recommendationDetails: {
          relatedAcademicEventId: item.id,
          needReasons: [`${item.date}에 예정된 ${item.title}에 대비해야 함`],
          placementReasons,
          priorityReasons: [score >= 28 ? "마감·시험과 작업량을 고려한 높은 우선순위" : score >= 16 ? "다가오는 일정과 작업량을 고려한 중간 우선순위" : "현재 4주 일정 안에서 준비 가능한 우선순위"],
          durationReasons: estimate.rationale,
          personalizationReasons: estimate.rationale.filter((reason) => reason.startsWith("사용자") || reason.includes("복습") || reason.includes("기초")),
          userRequestReasons: command.requestText === GENERATE_REQUEST_FALLBACK ? [] : [command.requestText],
          carriedOver: Boolean(carried), provisionalExamStudy: false,
        },
      };
      todos.push(todo); predecessor = todo;
      taskLoads.set(scheduledDate, taskMinutes + minutes);
      taskCounts.set(scheduledDate, (taskCounts.get(scheduledDate) ?? 0) + 1);
    }
    if (eventFailed || remaining > 0) {
      todos.splice(todoCheckpoint);
      taskLoads.clear(); taskLoadCheckpoint.forEach((value, key) => taskLoads.set(key, value));
      taskCounts.clear(); taskCountCheckpoint.forEach((value, key) => taskCounts.set(key, value));
      if (daysUntilDeadline <= 7) violations.push(`${item.title}: dependency·마감·사용자 조건·실제 capacity를 함께 만족하는 날짜가 없음`);
    }
  }
  return { todos, violations };
}

export function generateMockWeeklyPlan(command: GeneratePlanCommand): GeneratePlanResult {
  const window = getPlanWeekWindow(new Date(command.requestedAt));
  const weeklyPlanId = `weekly-${command.operationId}`;
  const relevant = command.extractedItems.filter((item) => {
    if (item.itemType === "class-schedule") return false;
    if (item.confirmationStatus !== "confirmed" || item.date === null) return false;
    const days = differenceInDays(window.weekStartDate, item.date);
    return days >= 0 && days <= 27;
  });
  const plan = {
    id: weeklyPlanId, userId: command.user.id, weekStartDate: window.weekStartDate,
    weekEndDate: window.weekEndDate, status: "complete" as const, createdAt: command.requestedAt,
    generationRequest: command.requestText, referenceWindowEndDate: window.referenceWindowEndDate,
    summary: "사용자 요청과 앞으로 4주 학업 일정을 고려한 7일 계획",
  };
  const scheduled = scheduleAcademicEventTodos(command, relevant, plan, weeklyPlanId);
  const todos = scheduled.todos;

  // 확정된 마감/시험이 아직 없다면 검수된 시간표만으로 최소 복습 계획을 만든다.
  if (relevant.length === 0) {
    const timetableItems = command.extractedItems.filter((item) =>
      item.itemType === "class-schedule" && item.confirmationStatus === "confirmed",
    );
    for (const item of timetableItems) {
      for (const meeting of item.classMeetingTimes) {
        let scheduledDate: string | null = null;
        for (let day = 0; day < 7; day += 1) {
          const candidate = addDays(window.weekStartDate, day);
          if (new Date(`${candidate}T00:00:00Z`).getUTCDay() === meeting.weekday) {
            scheduledDate = candidate;
            break;
          }
        }
        if (!scheduledDate) continue;
        const minutes = 45;
        todos.push({
          id: `todo-${command.operationId}-${item.id}-${meeting.id}`,
          weeklyPlanId,
          sourceExtractedItemId: item.id,
          scheduledDate,
          title: `${item.courseName} 수업 내용 복습하기`,
          todoType: "class-prep",
          courseName: item.courseName,
          estimatedDurationMinutes: minutes,
          priority: "low",
          isCompleted: false,
          recommendationReason: `${item.courseName} 수업 직후 핵심 내용을 짧게 복습하도록 배치했어요.`,
          durationRationale: ["시간표 기반 최소 복습 시간"],
          carriedOverFromTodoId: null,
          recommendationDetails: {
            relatedAcademicEventId: item.id,
            needReasons: [`확정된 ${item.courseName} 수업 일정이 있음`],
            placementReasons: [`${scheduledDate} 수업일에 짧은 복습으로 배치함`],
            priorityReasons: ["확정된 과제·시험이 없을 때 적용하는 최소 복습 계획"],
            durationReasons: ["시간표 기반 최소 복습 시간 45분"],
            personalizationReasons: [],
            userRequestReasons: command.requestText === GENERATE_REQUEST_FALLBACK ? [] : [command.requestText],
            carriedOver: false,
            provisionalExamStudy: false,
          },
        });
      }
    }
  }

  const constrained = rebalancePlanToConstraints(
    todos,
    parsePlanConstraints(command.requestText),
    plan,
    command.extractedItems,
    command.calendarEvents,
    command.planningProfile.maxDailyStudyMinutes ?? 240,
  );
  const schedulingOk = scheduled.violations.length === 0 && constrained.ok;
  const finalTodos = schedulingOk ? constrained.todos : todos;
  const hadCarryOver = finalTodos.some((todo) => todo.carriedOverFromTodoId);
  return {
    operationId: command.operationId,
    weeklyPlan: plan,
    todos: finalTodos,
    validationError: scheduled.violations.length ? scheduled.violations.join(", ") : constrained.ok ? undefined : constrained.violations.join(", "),
    assistantMessage: {
      id: `assistant-${command.operationId}`, role: "assistant", createdAt: command.requestedAt,
      status: "sent", intent: "generate-plan", operationId: command.operationId,
      text: schedulingOk
        ? `요청하신 조건과 앞으로 4주 학업 일정을 고려해 오늘부터 7일 계획을 만들었어요. 다가오는 시험과 마감은 미리 나누어 배치했어요.${hadCarryOver ? " 기존 미완료 항목도 다시 우선순위를 계산해 반영했어요." : ""}`
        : `요청한 조건을 모두 지키면서 마감 전 학습량을 배치하기 어려워 계획을 저장하지 않았어요. 충돌 조건: ${[...scheduled.violations, ...constrained.violations].join(", ")}`,
    },
  };
}

const GENERATE_REQUEST_FALLBACK = "주간계획 생성해줘. 다음의 요청사항을 반영해:";
