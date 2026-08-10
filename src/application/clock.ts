export interface Clock {
  now(): Date;
}

export const demoClock: Clock = {
  now: () => new Date("2026-07-22T09:00:00+09:00"),
};

export const demoInteractionClock: Clock = {
  now: () => new Date("2026-07-20T09:00:00+09:00"),
};

export const demoTodayDate = "2026-07-22";

export function createFixedClock(isoDate: string): Clock {
  return { now: () => new Date(isoDate) };
}
