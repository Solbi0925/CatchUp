import { getPlanWeekWindow } from "../domain/policies";
import type {
  ExtractedItem,
  GeneratePlanCommand,
  GeneratePlanResult,
  PlanningProfile,
  Todo,
} from "../domain/types";

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function eventMinutes(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute);
}

function todoType(item: ExtractedItem): Todo["todoType"] {
  if (item.itemType === "exam" || item.itemType === "quiz") return "exam-study";
  if (item.itemType === "class-schedule" || item.itemType === "notice") return "class-prep";
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

function capacityForDate(date: string, command: GeneratePlanCommand) {
  const busyMinutes = command.calendarEvents.filter((event) => event.date === date)
    .reduce((sum, event) => sum + (event.isAllDay ? 180 : eventMinutes(event.startTime, event.endTime)), 0);
  let capacity = Math.max(45, 210 - Math.min(165, busyMinutes));
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const names = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const request = command.requestText;
  if (new RegExp(`${names[weekday]}.*(하지 않|쉬)`).test(request)) return 0;
  if (new RegExp(`${names[weekday]}.*(적게|가볍|줄)`).test(request)) capacity = Math.min(capacity, 60);
  const maxHours = request.match(/하루.*최대\s*(\d+)시간/);
  if (maxHours) capacity = Math.min(capacity, Number(maxHours[1]) * 60);
  return capacity;
}

export function generateMockWeeklyPlan(command: GeneratePlanCommand): GeneratePlanResult {
  const window = getPlanWeekWindow(new Date(command.requestedAt));
  const weeklyPlanId = `weekly-${command.operationId}`;
  const relevant = command.extractedItems.filter((item) => {
    if (item.itemType === "class-schedule" || item.itemType === "notice") return false;
    return item.confirmationStatus === "confirmed" && item.date !== null && differenceInDays(window.weekStartDate, item.date) <= 27;
  });
  const carryOverByEvent = new Map(command.existingIncompleteTodos.map((todo) => [todo.sourceExtractedItemId, todo]));
  const ranked = relevant.map((item) => {
    const estimate = estimatePersonalizedDuration(item, command.planningProfile);
    const carried = carryOverByEvent.get(item.id);
    return { item, estimate, carried, score: priorityScore(item, window.weekStartDate, estimate.minutes, command.requestText, Boolean(carried)) };
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  const usedByDate = new Map<string, number>();
  const todos: Todo[] = [];
  for (const { item, estimate, carried, score } of ranked) {
    const totalMinutes = carried ? Math.max(estimate.minutes, carried.estimatedDurationMinutes) : estimate.minutes;
    const chunks = Math.max(1, Math.ceil(totalMinutes / 90));
    let remaining = totalMinutes;
    for (let index = 0; index < chunks; index += 1) {
      const minutes = Math.min(90, remaining);
      remaining -= minutes;
      const deadlineOffset = item.date ? Math.max(0, Math.min(6, differenceInDays(window.weekStartDate, item.date) - 1)) : 6;
      let scheduledDate = window.weekStartDate;
      let lowestLoad = Number.POSITIVE_INFINITY;
      for (let day = 0; day <= deadlineOffset; day += 1) {
        const date = addDays(window.weekStartDate, day);
        const used = usedByDate.get(date) ?? 0;
        const capacity = capacityForDate(date, command);
        if (capacity > 0 && used + minutes <= capacity && used < lowestLoad) {
          scheduledDate = date;
          lowestLoad = used;
        }
      }
      usedByDate.set(scheduledDate, (usedByDate.get(scheduledDate) ?? 0) + minutes);
      todos.push({
        id: `todo-${command.operationId}-${item.id}-${index}`,
        weeklyPlanId,
        sourceExtractedItemId: item.id,
        scheduledDate,
        title: todoTitle(item, index, chunks),
        todoType: todoType(item),
        courseName: item.courseName,
        estimatedDurationMinutes: minutes,
        priority: score >= 28 ? "high" : score >= 16 ? "medium" : "low",
        isCompleted: false,
        recommendationReason: carried
          ? "이전 계획에서 완료되지 않아 마감과 새 일정을 다시 비교해 배치했어요."
          : item.date ? `${item.date} 일정과 앞으로 4주 내 다른 학업 일정을 함께 비교해 배치했어요.` : `${item.scheduledWeekLabel ?? "예정 주차"} 시험 준비를 넓은 복습 단위로 미리 시작하도록 배치했어요.`,
        durationRationale: estimate.rationale,
        carriedOverFromTodoId: carried?.id ?? null,
        recommendationDetails: {
          relatedAcademicEventId: item.id,
          needReasons: [item.date ? `${item.date}에 예정된 ${item.title}에 대비해야 함` : `${item.scheduledWeekLabel ?? "예정 주차"}에 예정된 시험을 미리 준비해야 함`],
          placementReasons: [`계획 기간의 학습량을 비교해 ${scheduledDate}에 배치함`],
          priorityReasons: [score >= 28 ? "마감·시험과 작업량을 고려한 높은 우선순위" : score >= 16 ? "다가오는 일정과 작업량을 고려한 중간 우선순위" : "현재 4주 일정 안에서 준비 가능한 우선순위"],
          durationReasons: estimate.rationale,
          personalizationReasons: estimate.rationale.filter((reason) => reason.startsWith("사용자") || reason.includes("복습") || reason.includes("기초")),
          userRequestReasons: command.requestText === GENERATE_REQUEST_FALLBACK ? [] : [command.requestText],
          carriedOver: Boolean(carried),
          provisionalExamStudy: item.date === null && (item.itemType === "exam" || item.itemType === "quiz"),
        },
      });
    }
  }

  // 확정된 마감/시험이 아직 없다면 검수된 시간표만으로 최소 복습 계획을 만든다.
  if (ranked.length === 0) {
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

  const hadCarryOver = todos.some((todo) => todo.carriedOverFromTodoId);
  return {
    operationId: command.operationId,
    weeklyPlan: {
      id: weeklyPlanId, userId: command.user.id, weekStartDate: window.weekStartDate,
      weekEndDate: window.weekEndDate, status: "complete", createdAt: command.requestedAt,
      generationRequest: command.requestText, referenceWindowEndDate: window.referenceWindowEndDate,
      summary: "사용자 요청과 앞으로 4주 학업 일정을 고려한 7일 계획",
    },
    todos,
    assistantMessage: {
      id: `assistant-${command.operationId}`, role: "assistant", createdAt: command.requestedAt,
      status: "sent", intent: "generate-plan", operationId: command.operationId,
      text: `요청하신 조건과 앞으로 4주 학업 일정을 고려해 오늘부터 7일 계획을 만들었어요. 다가오는 시험과 마감은 미리 나누어 배치했어요.${hadCarryOver ? " 기존 미완료 항목도 다시 우선순위를 계산해 반영했어요." : ""}`,
    },
  };
}

const GENERATE_REQUEST_FALLBACK = "주간계획 생성해줘. 다음의 요청사항을 반영해:";
