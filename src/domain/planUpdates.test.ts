import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { createPlanUpdateRecommendation } from "./planUpdates";
import { selectScheduleAcademicItems } from "./selectors";
import { createInitialPrototypeState } from "../store/prototypeReducer";

describe("plan update recommendation", () => {
  it("detects an unconfirmed exam becoming dated and confirmed", () => {
    const previous = academicEventFixture({ id: "exam", itemType: "exam", date: null, scheduledWeek: 9, examScope: null, confirmationStatus: "unconfirmed", reviewStatus: "confirmed" });
    const next = academicEventFixture({ id: "exam", itemType: "exam", date: "2026-09-30", scheduledWeek: 9, examScope: "1~7주차", confirmationStatus: "confirmed", reviewStatus: "confirmed", updatedAt: "2026-08-13T00:00:00Z" });
    const result = createPlanUpdateRecommendation({ exam: previous }, [next], next.updatedAt);
    expect(result).toMatchObject({ reasonKind: "exam-updated", academicEventIds: ["exam"] });
  });

  it("ignores an unconfirmed assignment that still cannot be planned", () => {
    const item = academicEventFixture({ id: "assignment", date: null, scheduledWeek: 8, confirmationStatus: "unconfirmed", reviewStatus: "confirmed" });
    expect(createPlanUpdateRecommendation({}, [item], item.updatedAt)).toBeNull();
  });

  it("keeps the previous week-only schedule representation until update acceptance", () => {
    const previous = academicEventFixture({ id: "exam", itemType: "exam", date: null, scheduledWeek: 9, scheduledWeekLabel: "9주차", reviewStatus: "confirmed", confirmationStatus: "unconfirmed" });
    const next = academicEventFixture({ id: "exam", itemType: "exam", date: "2026-09-30", scheduledWeek: 9, reviewStatus: "confirmed", confirmationStatus: "confirmed" });
    const state = createInitialPrototypeState();
    state.extractedItemsById = { exam: next };
    state.pendingPlanUpdate = { id: "pending", reasonKind: "exam-updated", academicEventIds: ["exam"], message: "업데이트", detectedAt: next.updatedAt, previousAcademicEvents: [previous], status: "pending" };
    expect(selectScheduleAcademicItems(state)[0]).toMatchObject({ date: "2026-09-30" });
    state.pendingPlanUpdate = null;
    expect(selectScheduleAcademicItems(state)[0]).toMatchObject({ date: "2026-09-30" });
  });
});
