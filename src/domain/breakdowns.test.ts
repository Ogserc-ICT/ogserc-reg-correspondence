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
    units: seed.units,
    firstMonth: "2026-11-01",
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
        o.id === "O1" ? "Registration & Licensing" : "Office of the Chairman",
      type: o.type.name,
      recipientCategory: o.id === "O1" ? "Registrant / licensee" : "NERC",
      documentDate: o.documentDate,
    })),
  });
}

describe("dashboard breakdowns", () => {
  it("counts by unit with one definition of pending (R12)", () => {
    const b = breakdowns("2026-12-10");
    expect(b.byUnit).toHaveLength(10);
    expect(
      b.byUnit.find((u) => u.label === "Registration & Licensing"),
    ).toEqual({
      label: "Registration & Licensing",
      inwardRouted: 2,
      pending: 1, // I2, awaiting forwarding, counts as pending
      overdue: 0,
      closed: 1,
      outwardOriginated: 1,
    });
    expect(
      b.byUnit.find((u) => u.label === "Office of the Chairman"),
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
    expect(b.byMonth).toHaveLength(24);
    expect(b.byMonth.slice(0, 2)).toEqual([
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
