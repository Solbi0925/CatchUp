import type { CalendarEvent, User } from "../domain/types";

export const demoUser: User = {
  id: "user-demo-01",
  displayName: "테스트 학생",
  calendarConnectionStatus: "connected",
  weeklyPlanGenerationDay: 0,
  weeklyPlanGenerationTime: "20:00",
  planGenerationRequest: "일요일에는 쉬는 시간을 많이 확보하고 수요일은 가볍게 계획해줘.",
};

export const demoCalendarEvents: CalendarEvent[] = [
  {
    id: "calendar-demo-01",
    userId: demoUser.id,
    title: "팀 프로젝트 회의",
    date: "2026-07-20",
    startTime: "14:00",
    endTime: "16:00",
    isAllDay: false,
    source: "google-calendar",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
  {
    id: "calendar-demo-02",
    userId: demoUser.id,
    title: "병원 예약",
    date: "2026-07-22",
    startTime: "10:30",
    endTime: "11:30",
    isAllDay: false,
    source: "google-calendar",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
  {
    id: "calendar-demo-03",
    userId: demoUser.id,
    title: "동아리 정기 모임",
    date: "2026-07-22",
    startTime: "17:00",
    endTime: "19:00",
    isAllDay: false,
    source: "google-calendar",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
  {
    id: "calendar-demo-04",
    userId: demoUser.id,
    title: "휴식일",
    date: "2026-07-26",
    startTime: null,
    endTime: null,
    isAllDay: true,
    source: "google-calendar",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
];
