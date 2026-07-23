import { getPlanWeekWindow } from "../domain/policies";
import type {
  ExtractedItem,
  GeneratePlanCommand,
  GeneratePlanResult,
  Todo,
} from "../domain/types";

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function eventMinutes(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute);
}

function todoType(item: ExtractedItem): Todo["todoType"] {
  if (item.itemType === "exam") return "exam-study";
  if (item.itemType === "class-schedule" || item.itemType === "notice") return "class-prep";
  return "assignment-work";
}

function todoTitle(item: ExtractedItem, chunkIndex: number, totalChunks: number) {
  if (item.itemType === "exam") {
    return chunkIndex === totalChunks - 1
      ? `${item.title} 핵심 내용 점검하기`
      : `${item.title} 개념 복습하기`;
  }
  if (item.itemType === "notice" || item.itemType === "class-schedule") {
    return `${item.title} 확인하고 준비하기`;
  }
  if (totalChunks === 1) return `${item.title} 마무리하기`;
  if (chunkIndex === 0) return `${item.title} 요구사항 정리하기`;
  if (chunkIndex === totalChunks - 1) return `${item.title} 검토하고 제출하기`;
  return `${item.title} 이어서 진행하기`;
}

function capacityForDate(
  date: string,
  command: GeneratePlanCommand,
  dayIndex: number,
) {
  const busyMinutes = command.calendarEvents
    .filter((event) => event.date === date)
    .reduce(
      (sum, event) => sum + (event.isAllDay ? 180 : eventMinutes(event.startTime, event.endTime)),
      0,
    );
  let capacity = Math.max(30, 180 - Math.min(150, busyMinutes));
  const request = `${command.user.planGenerationRequest} ${command.requestText}`;
  if (dayIndex === 2 && /수요일.*(가볍|줄)/.test(request)) capacity = Math.min(capacity, 60);
  if (dayIndex === 6 && /일요일.*(쉬|가볍)/.test(request)) capacity = Math.min(capacity, 60);
  return capacity;
}

export function generateMockWeeklyPlan(command: GeneratePlanCommand): GeneratePlanResult {
  const window = getPlanWeekWindow(new Date(command.requestedAt));
  const weeklyPlanId = `weekly-${command.operationId}`;
  const minutesByDate = new Map<string, number>();
  const todos: Todo[] = [];
  const sortedItems = [...command.extractedItems].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) return dateOrder;
    const difficultyOrder = { high: 0, medium: 1, low: 2 };
    return difficultyOrder[left.difficulty] - difficultyOrder[right.difficulty] ||
      left.id.localeCompare(right.id);
  });

  for (const item of sortedItems) {
    const chunkCount = Math.max(1, Math.ceil(item.estimatedDurationMinutes / 90));
    let remaining = item.estimatedDurationMinutes;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunkMinutes = Math.min(90, remaining);
      remaining -= chunkMinutes;
      const deadlineOffset = Math.max(
        0,
        Math.min(6, differenceInDays(window.weekStartDate, item.date)),
      );
      let scheduledDate = window.weekStartDate;
      for (let dayIndex = 0; dayIndex <= deadlineOffset; dayIndex += 1) {
        const candidateDate = addDays(window.weekStartDate, dayIndex);
        const used = minutesByDate.get(candidateDate) ?? 0;
        if (used + chunkMinutes <= capacityForDate(candidateDate, command, dayIndex)) {
          scheduledDate = candidateDate;
          break;
        }
        scheduledDate = candidateDate;
      }
      minutesByDate.set(scheduledDate, (minutesByDate.get(scheduledDate) ?? 0) + chunkMinutes);
      const daysToDeadline = differenceInDays(scheduledDate, item.date);
      todos.push({
        id: `todo-${command.operationId}-${item.id}-${chunkIndex}`,
        weeklyPlanId,
        sourceExtractedItemId: item.id,
        scheduledDate,
        title: todoTitle(item, chunkIndex, chunkCount),
        todoType: todoType(item),
        courseName: item.courseName,
        estimatedDurationMinutes: chunkMinutes,
        priority: item.difficulty === "high" || daysToDeadline <= 2 ? "high" : "medium",
        isCompleted: false,
        recommendationReason:
          daysToDeadline <= 2
            ? `${item.date} 마감 전 검토 시간을 확보하도록 먼저 배치했어요.`
            : `예상 소요 시간을 나누고 개인 일정과 겹치지 않게 배치했어요.`,
      });
    }
  }

  return {
    operationId: command.operationId,
    weeklyPlan: {
      id: weeklyPlanId,
      userId: command.user.id,
      weekStartDate: window.weekStartDate,
      weekEndDate: window.weekEndDate,
      status: "complete",
      createdAt: command.requestedAt,
      generationRequest: command.requestText,
      referenceWindowEndDate: window.referenceWindowEndDate,
      summary: "가까운 마감과 개인 일정을 반영해 할 일을 나누어 배치했어요.",
    },
    todos,
    assistantMessage: {
      id: `assistant-${command.operationId}`,
      role: "assistant",
      text: "업로드 자료와 캘린더를 반영해\n이번 주 계획을 생성했어요.",
      createdAt: command.requestedAt,
      status: "sent",
      intent: "generate-plan",
      operationId: command.operationId,
    },
  };
}
