import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../../domain/types";
import mockCalendarEventMutation, {
  MOCK_CALENDAR_EVENT_MUTATION_DELAY_MS,
  createMockCalendarEventMutation,
} from "./mockCalendarEventMutation";

const event: CalendarEvent = {
  id: "event-catchup-01",
  userId: "user-demo-01",
  title: "스터디 준비",
  date: "2026-07-24",
  startTime: "14:00",
  endTime: "15:00",
  isAllDay: false,
  eventType: "personal",
  source: "catchup",
  updatedAt: "2026-07-20T09:00:00.000Z",
};

describe("mock calendar event mutation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves default save and delete asynchronously", async () => {
    vi.useFakeTimers();
    let saveFinished = false;
    let deleteFinished = false;
    const save = mockCalendarEventMutation.save(event).then(() => {
      saveFinished = true;
    });
    const remove = mockCalendarEventMutation.delete(event.id).then(() => {
      deleteFinished = true;
    });

    await Promise.resolve();
    expect(saveFinished).toBe(false);
    expect(deleteFinished).toBe(false);

    await vi.advanceTimersByTimeAsync(MOCK_CALENDAR_EVENT_MUTATION_DELAY_MS);

    await expect(save).resolves.toBeUndefined();
    await expect(remove).resolves.toBeUndefined();
    expect(saveFinished).toBe(true);
    expect(deleteFinished).toBe(true);
  });

  it("rejects save with a stable Korean form error", async () => {
    const mutation = createMockCalendarEventMutation({ save: "reject", delayMs: 0 });

    await expect(mutation.save(event)).rejects.toThrow(
      "일정을 저장하지 못했어요. 다시 시도해주세요.",
    );
  });

  it("rejects delete with a stable Korean row error", async () => {
    const mutation = createMockCalendarEventMutation({ delete: "reject", delayMs: 0 });

    await expect(mutation.delete(event.id)).rejects.toThrow(
      "일정을 삭제하지 못했어요. 다시 시도해주세요.",
    );
  });

  it("succeeds when a fail-once save is retried", async () => {
    const mutation = createMockCalendarEventMutation({ save: "fail-once", delayMs: 0 });

    await expect(mutation.save(event)).rejects.toThrow("일정을 저장하지 못했어요. 다시 시도해주세요.");
    await expect(mutation.save(event)).resolves.toBeUndefined();
  });

  it("keeps fail-once state isolated between adapter instances", async () => {
    const first = createMockCalendarEventMutation({ delete: "fail-once", delayMs: 0 });
    const second = createMockCalendarEventMutation({ delete: "fail-once", delayMs: 0 });

    await expect(first.delete(event.id)).rejects.toThrow("일정을 삭제하지 못했어요. 다시 시도해주세요.");
    await expect(second.delete(event.id)).rejects.toThrow("일정을 삭제하지 못했어요. 다시 시도해주세요.");
    await expect(first.delete(event.id)).resolves.toBeUndefined();
    await expect(second.delete(event.id)).resolves.toBeUndefined();
  });
});
