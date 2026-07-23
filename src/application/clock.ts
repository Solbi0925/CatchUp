export interface Clock {
  now(): Date;
}

export const demoClock: Clock = {
  now: () => new Date("2026-07-19T20:00:00+09:00"),
};

export function createFixedClock(isoDate: string): Clock {
  return { now: () => new Date(isoDate) };
}
