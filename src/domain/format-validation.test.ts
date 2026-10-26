import { describe, expect, it } from "vitest";
import { instantIn } from "./clock";
import {
  formatClockTime,
  formatDate,
  formatDateTime,
  formatNaira,
  parseNairaToKobo,
} from "./format";
import {
  inwardDateProblems,
  isPhone,
  missingFields,
  outwardDateProblems,
} from "./validation";

describe("formats (TEMPLATES.md)", () => {
  it("formats dates, date-times in Lagos and money", () => {
    expect(formatDate("2026-11-20")).toBe("20-Nov-2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(instantIn("2026-11-30", "18:40"))).toBe(
      "30-Nov-2026 18:40",
    );
    expect(formatDateTime(new Date("2026-12-09T23:30:00Z"))).toBe(
      "10-Dec-2026 00:30",
    );
    expect(formatNaira(BigInt(25_000_000))).toBe("₦250,000");
    expect(formatNaira(BigInt(123_456_789))).toBe("₦1,234,567.89");
    expect(formatNaira(null)).toBe("—");
    expect(formatClockTime("17:00")).toBe("5:00 p.m.");
    expect(formatClockTime("09:30")).toBe("9:30 a.m.");
    expect(formatClockTime("12:00")).toBe("12:00 p.m.");
  });

  it("parses naira amounts to kobo", () => {
    expect(parseNairaToKobo("₦250,000")).toBe(BigInt(25_000_000));
    expect(parseNairaToKobo("10.5")).toBe(BigInt(1050));
    expect(parseNairaToKobo("")).toBeNull();
    expect(parseNairaToKobo("12.345")).toBe("invalid");
    expect(parseNairaToKobo("abc")).toBe("invalid");
  });
});

describe("date order (SPEC §9 R10)", () => {
  const today = "2026-12-10";
  it("blocks forwarding or closing before receipt, and future dates", () => {
    expect(
      inwardDateProblems(
        {
          receiptDate: "2026-12-01",
          receivedAtInFuture: false,
          dateForwarded: "2026-11-30",
          dateClosedManual: "2026-12-11",
        },
        today,
      ),
    ).toEqual([
      "Date forwarded can't be before the date received.",
      "Date closed can't be in the future.",
    ]);
    expect(
      inwardDateProblems(
        { receiptDate: "2026-12-11", receivedAtInFuture: true },
        today,
      ),
    ).toEqual(["Date & time received can't be in the future."]);
    expect(
      inwardDateProblems(
        {
          receiptDate: "2026-12-01",
          receivedAtInFuture: false,
          dateForwarded: "2026-12-01",
        },
        today,
      ),
    ).toEqual([]);
  });

  it("blocks dispatch before the document, delivery before dispatch, and future dates", () => {
    expect(
      outwardDateProblems(
        {
          documentDate: "2026-12-02",
          dateDispatched: "2026-12-01",
          dateDelivered: "2026-11-30",
        },
        today,
      ),
    ).toEqual([
      "Date dispatched can't be before the date of the document.",
      "Date delivered can't be before the date dispatched.",
    ]);
    expect(
      outwardDateProblems(
        { documentDate: "2026-12-02", deliveryConfirmed: true },
        today,
      ),
    ).toEqual(["Record the dispatch first (DISPATCHED TODAY)."]);
    expect(
      outwardDateProblems(
        { documentDate: "2026-12-02", dateDispatched: "2026-12-11" },
        today,
      ),
    ).toEqual(["Date dispatched can't be in the future."]);
  });
});

it("lists missing fields in order", () => {
  expect(
    missingFields([
      { label: "Sender", value: " " },
      { label: "Subject", value: "x" },
      { label: "Type", value: null },
    ]),
  ).toEqual(["Sender", "Type"]);
});

it("accepts phone numbers with 7–20 digits", () => {
  expect(isPhone("+234 803 123 4567")).toBe(true);
  expect(isPhone("0803-123-4567")).toBe(true);
  expect(isPhone("12345")).toBe(false);
  expect(isPhone("call me")).toBe(false);
});
