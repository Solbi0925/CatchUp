export interface WeekDayViewModel {
  date: string;
  weekdayLabel: "월" | "화" | "수" | "목" | "금" | "토" | "일";
  dayOfMonth: number;
  isToday: boolean;
  isSelected: boolean;
  isWithinPlanRange: boolean;
  todoCount: number;
  scheduleCount: number;
}

export interface TodayTodoViewModel {
  id: string;
  title: string;
  courseOrSource: string;
  estimatedMinutes: number;
  priority: "high" | "medium" | "low";
  completed: boolean;
  dueAt: string | null;
  recommendationSummary: string;
}

export interface TodayScheduleViewModel {
  id: string;
  title: string;
  timeLabel: string;
  type: "deadline" | "submission" | "exam" | "notice" | "personal";
  sourceLabel: "업로드 자료" | "Google Calendar" | "CatchUp 직접 입력";
  categoryKey: string;
}

export interface TodayViewModel {
  selectedDate: string;
  weekStart: string;
  weekEnd: string;
  planStartDate: string | null;
  planEndDate: string | null;
  days: WeekDayViewModel[];
  todos: TodayTodoViewModel[];
  schedules: TodayScheduleViewModel[];
  adjustmentRemaining: number;
}
