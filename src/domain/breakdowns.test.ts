// SPEC §8.4 breakdowns on the §12.2 example, 10 Dec 2026.
import { describe, expect, it } from "vitest";
import {
  evaluate,
  workbookExample,
} from "../../tests/fixtures/workbook-example";
import seed from "../../seed-data.json";
import {
  dashboardBreakdowns,
  dashboardMonths,
  lastDashboardDay,
} from "./breakdowns";

function breakdowns(today: string) {
  const s = workbookExample();
  const r = evaluate(s, today);
  return dashboardBreakdowns({
    units: seed.units.map((u) => u.name),
    firstMonth: "2026-11-01",
    today,
    inward: s.inward.map((i) => {
      const d = r.inward.get(i.id)!.derived;
      return {
        voided: i.voided,
        derived: d,
        unit: d.routedUnitId!, // fixture unit ids are the names
        category: d.category!,
        type: i.type!.name,
        senderCategory: i.senderCategoryId!,
        lga: i.id === "I1" ? "Sagamu" : null,
      };
    }),
    outward: s.outward.map((o) => ({
      voided: o.voided,
      derived: r.outward.get(o.id)!.derived,
      unit:
        o.id === "O1"
          ? "Licensing unit"
          : "Office of the General Counsel and Secretary (Registry)",
      type: o.type.name,
      recipientCategory: o.id === "O1" ? "Registrant / licensee" : "NERC",
      documentDate: o.documentDate,
    })),
  });
}

describe("dashboard breakdowns", () => {
  it("counts by unit with one definition of pending (R12)", () => {
    const b = breakdowns("2026-12-10");
    expect(b.byUnit).toHaveLength(30);
    expect(b.byUnit.find((u) => u.label === "Licensing unit")).toEqual({
      label: "Licensing unit",
      inwardRouted: 2,
      pending: 1, // I2, awaiting forwarding, counts as pending
      overdue: 0,
      closed: 1,
      outwardOriginated: 1,
    });
    expect(
      b.byUnit.find(
        (u) =>
          u.label === "Office of the General Counsel and Secretary (Registry)",
      ),
    ).toMatchObject({
      inwardRouted: 1,
      closed: 1,
      outwardOriginated: 1,
    });
  });

  it("uses the same pending in the category table", () => {
    const b = breakdowns("2026-12-16");
    expect(b.byCategory.find((c) => c.label === "Regulatory filing")).toEqual({
      label: "Regulatory filing",
      received: 2,
      pending: 1,
      overdue: 1,
    });
  });

  it("counts by month (inward by deemed date, outward by document date)", () => {
    const b = breakdowns("2026-12-10");
    // Ends at this month: nothing plotted for the future.
    expect(b.byMonth).toEqual([
      { month: "2026-11", inward: 1, outward: 1 },
      { month: "2026-12", inward: 2, outward: 1 }, // I2 deemed 1 Dec
    ]);
  });

  it("counts by correspondent, type and LGA", () => {
    const b = breakdowns("2026-12-10");
    expect(b.byCorrespondent.inward).toEqual([
      { label: "Registrant / licensee", received: 2 },
      { label: "NERC", received: 1 },
    ]);
    expect(b.outgoingByType.map((t) => t.label).sort()).toEqual([
      "Deficiency notice",
      "Letter to NERC / Federal agency",
    ]);
    expect(b.incomingByLga).toEqual([{ label: "Sagamu", received: 1 }]);
  });

  it("stops at today's month, or the latest month with items, capped at 24", () => {
    expect(breakdowns("2027-03-15").byMonth.map((m) => m.month)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
    // Before the first month (e.g. dev data dated ahead), show the months with items.
    expect(breakdowns("2026-10-26").byMonth.map((m) => m.month)).toEqual([
      "2026-11",
      "2026-12",
    ]);
    expect(breakdowns("2031-01-01").byMonth).toHaveLength(24);
  });

  it("builds the 24-month window", () => {
    expect(dashboardMonths("2026-11-01").slice(0, 3)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
    expect(dashboardMonths("2026-11-01").at(-1)).toBe("2028-10");
    expect(lastDashboardDay("2026-11-01")).toBe("2028-10-31");
  });
});
