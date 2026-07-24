import type { CalendarEvent, CalendarEventId } from "../../domain/types";

export const SAVE_CALENDAR_EVENT_ERROR = "일정을 저장하지 못했어요. 다시 시도해주세요.";
export const DELETE_CALENDAR_EVENT_ERROR = "일정을 삭제하지 못했어요. 다시 시도해주세요.";
export const MOCK_CALENDAR_EVENT_MUTATION_DELAY_MS = 300;

export interface CalendarEventMutationAdapter {
  save(event: CalendarEvent): Promise<void>;
  delete(eventId: CalendarEventId): Promise<void>;
}

type MockMutationBehavior = "success" | "reject" | "fail-once";

export interface MockCalendarEventMutationOptions {
  save?: MockMutationBehavior;
  delete?: MockMutationBehavior;
  delayMs?: number;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function createOperation(behavior: MockMutationBehavior, errorMessage: string, delayMs: number) {
  let hasFailed = false;

  return async () => {
    await wait(delayMs);
    if (behavior === "reject" || (behavior === "fail-once" && !hasFailed)) {
      hasFailed = true;
      throw new Error(errorMessage);
    }
  };
}

export function createMockCalendarEventMutation({
  save = "success",
  delete: deleteBehavior = "success",
  delayMs = MOCK_CALENDAR_EVENT_MUTATION_DELAY_MS,
}: MockCalendarEventMutationOptions = {}): CalendarEventMutationAdapter {
  const saveOperation = createOperation(save, SAVE_CALENDAR_EVENT_ERROR, delayMs);
  const deleteOperation = createOperation(deleteBehavior, DELETE_CALENDAR_EVENT_ERROR, delayMs);

  return {
    save: async (_event) => saveOperation(),
    delete: async (_eventId) => deleteOperation(),
  };
}

const mockCalendarEventMutation = createMockCalendarEventMutation();

export default mockCalendarEventMutation;
