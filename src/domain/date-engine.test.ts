// SPEC §12.1 (D1–D13) and N5, plus edge cases of the Excel semantics.
import { describe, expect, it } from "vitest";
import {
  seedHolidays as hols,
  seedRules as rules,
} from "../../tests/fixtures/rules";
import {
  addWorkingDays,
  dayOfWeek,
  isIsoDate,
  isWorkingDay,
  workingDaysBetween,
} from "./calendar";
import { instantIn, todayIn } from "./clock";
import { inwardNumberYear } from "./numbering";
import { deemedReceiptDate, registrationDeadline } from "./receipt";

const deemed = (date: string, time: string, mode: string) =>
  deemedReceiptDate(instantIn(date, time), mode, rules, hols);

describe("deemed receipt date (SPEC §2.1)", () => {
  it.each([
    ["D1", "2026-11-20", "10:15", "Hand delivery", "2026-11-20"],
    ["D2", "2026-11-30", "18:40", "Email", "2026-12-01"],
    ["D3", "2026-11-30", "16:59", "Email", "2026-11-30"],
    ["D4", "2026-11-30", "17:00", "Email", "2026-12-01"],
    ["D5", "2026-11-30", "18:40", "Hand delivery", "2026-11-30"],
    ["D6", "2026-12-05", "10:00", "Hand delivery", "2026-12-07"],
    ["D7", "2026-12-24", "17:30", "Email", "2026-12-29"],
    ["D8", "2026-12-31", "17:30", "Email", "2027-01-04"],
  ])("%s: %s %s by %s → %s", (_, date, time, mode, expected) => {
    expect(deemed(date, time, mode)).toBe(expected);
  });

  it("D8: the 31 Dec email takes a 2027 number", () => {
    expect(inwardNumberYear(deemed("2026-12-31", "17:30", "Email"))).toBe(2027);
  });

  it("applies the cut-off to the online portal too", () => {
    expect(deemed("2026-11-30", "17:00", "Online portal")).toBe("2026-12-01");
  });

  it("treats 16:59:59 as within hours", () => {
    const at = new Date(instantIn("2026-11-30", "16:59").getTime() + 59_000);
    expect(deemedReceiptDate(at, "Email", rules, hols)).toBe("2026-11-30");
  });

  it("moves a holiday morning email to the next working day", () => {
    expect(deemed("2026-12-25", "09:00", "Email")).toBe("2026-12-29");
  });
});

describe("working days (SPEC §2)", () => {
  it("D9: addWorkingDays(20 Nov 2026, 20) = 18 Dec 2026", () => {
    expect(addWorkingDays("2026-11-20", 20, hols)).toBe("2026-12-18");
  });

  it("D10: addWorkingDays(23 Dec 2026, 1) = 24 Dec 2026", () => {
    expect(addWorkingDays("2026-12-23", 1, hols)).toBe("2026-12-24");
  });

  it("D11: workingDaysBetween(1 Dec, 10 Dec 2026) = 7", () => {
    expect(workingDaysBetween("2026-12-01", "2026-12-10", hols)).toBe(7);
  });

  it("D12: workingDaysBetween(20 Nov, 25 Nov 2026) = 3", () => {
    expect(workingDaysBetween("2026-11-20", "2026-11-25", hols)).toBe(3);
  });

  it("matches WORKDAY(d, 0) = d, even on a holiday", () => {
    expect(addWorkingDays("2026-12-25", 0, hols)).toBe("2026-12-25");
  });

  it("steps backwards for negative n", () => {
    expect(addWorkingDays("2026-12-29", -1, hols)).toBe("2026-12-24");
  });

  it("floors at 0 when the end is before the start or on the same day", () => {
    expect(workingDaysBetween("2026-12-10", "2026-12-01", hols)).toBe(0);
    expect(workingDaysBetween("2026-12-10", "2026-12-10", hols)).toBe(0);
    expect(workingDaysBetween("2026-12-25", "2026-12-28", hols)).toBe(0);
  });

  it("counts weekends and seeded holidays as non-working", () => {
    expect(isWorkingDay("2026-12-05", hols)).toBe(false); // Saturday
    expect(isWorkingDay("2026-12-28", hols)).toBe(false); // substitute holiday
    expect(isWorkingDay("2026-12-29", hols)).toBe(true);
    expect(dayOfWeek("2026-11-20")).toBe(5); // Friday
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-1-5")).toBe(false);
  });
});

describe("registration deadline (SPEC §2.2)", () => {
  it("D13: 2 Nov 2026 + 60 days = 1 Jan 2027 with rollover off", () => {
    expect(registrationDeadline(rules, hols)).toBe("2027-01-01");
  });

  it("D13: 4 Jan 2027 with rollover on", () => {
    expect(
      registrationDeadline(
        { ...rules, deadlineRollsToNextWorkingDay: true },
        hols,
      ),
    ).toBe("2027-01-04");
  });
});

describe("Lagos today (SPEC §9 R7)", () => {
  it("N5: 10 Dec 2026 00:30 Lagos (9 Dec 23:30 UTC) is 10 Dec", () => {
    const now = new Date("2026-12-09T23:30:00Z");
    expect(todayIn(now)).toBe("2026-12-10");
    expect(instantIn("2026-12-10", "00:30").toISOString()).toBe(
      "2026-12-09T23:30:00.000Z",
    );
  });

  it("reads the 17:00 cut-off in Lagos, not UTC (16:00Z is 17:00 Lagos)", () => {
    const at = new Date("2026-11-30T16:00:00Z");
    expect(deemedReceiptDate(at, "Email", rules, hols)).toBe("2026-12-01");
  });
});
