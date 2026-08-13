import { describe, expect, it } from "vitest";
import { academicEventFixture } from "../test/academicEventFixture";
import { readAcademicEvents, writeAcademicEvents } from "./academicEventsStorage";

describe("academic events local storage", () => {
  it("stores confirmed and unconfirmed academic events", () => {
    writeAcademicEvents([
      academicEventFixture({ id: "confirmed" }),
      academicEventFixture({
        id: "unconfirmed",
        date: null,
        confirmationStatus: "unconfirmed",
        confirmationIssues: ["missing-date"],
      }),
    ]);

    expect(readAcademicEvents().map((item) => [item.id, item.confirmationStatus])).toEqual([
      ["confirmed", "confirmed"],
      ["unconfirmed", "unconfirmed"],
    ]);
  });

  it("migrates the legacy confirmed-event storage", () => {
    const legacy = academicEventFixture();
    window.localStorage.setItem(
      "catchup.confirmed-academic-events.v1",
      JSON.stringify([{ ...legacy, confirmationStatus: undefined }]),
    );
    expect(readAcademicEvents()[0].confirmationStatus).toBe("confirmed");
  });
});
