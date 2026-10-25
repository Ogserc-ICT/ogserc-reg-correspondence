// Guards the handoff data the seed (Phase 2) and every fixture in SPEC §12 depend on.
import { describe, expect, it } from "vitest";
import seed from "../seed-data.json";

describe("seed-data.json", () => {
  it("has the reference lists the SPEC expects", () => {
    expect(seed.incomingTypes).toHaveLength(31);
    expect(seed.outgoingTypes).toHaveLength(23);
    expect(seed.units).toHaveLength(10);
  });

  it("has unique type names", () => {
    const names = (xs: { name: string }[]) =>
      new Set(xs.map((x) => x.name)).size;
    expect(names(seed.incomingTypes)).toBe(seed.incomingTypes.length);
    expect(names(seed.outgoingTypes)).toBe(seed.outgoingTypes.length);
  });

  it("only routes incoming types to known units", () => {
    const units = new Set<string>(seed.units);
    for (const t of seed.incomingTypes) expect(units).toContain(t.defaultUnit);
  });

  it("does not let a holding reply close an inward item (SPEC §9 R4)", () => {
    const holding = seed.outgoingTypes.find(
      (t) => t.name === "Acknowledgement / holding reply",
    );
    expect(holding?.closesInwardItem).toBe(false);
  });

  it("has ISO dates for every public holiday", () => {
    for (const h of seed.publicHolidays)
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
