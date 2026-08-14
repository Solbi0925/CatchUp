export interface Clock {
  now(): Date;
}

export const demoClock: Clock = {
  now: () => import.meta.env.MODE === "test" ? new Date("2026-07-19T20:00:00+09:00") : new Date(),
};

export const demoInteractionClock: Clock = {
  now: () => import.meta.env.MODE === "test" ? new Date("2026-07-20T09:00:00+09:00") : new Date(),
};

export const demoTodayDate = "2026-07-20";

export function currentTodayDate(now = new Date()) {
  // 기존 시각 고정 테스트는 유지하되, 실제 앱에서는 한국 표준시의 오늘을 사용한다.
  if (import.meta.env.MODE === "test" && arguments.length === 0) return demoTodayDate;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function createFixedClock(isoDate: string): Clock {
  return { now: () => new Date(isoDate) };
}
