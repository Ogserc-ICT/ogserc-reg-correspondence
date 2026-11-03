// Guards the handoff data the seed (Phase 2) and every fixture in SPEC §12 depend on.
import { describe, expect, it } from "vitest";
import seed from "../seed-data.json";

describe("seed-data.json", () => {
  it("has the reference lists the SPEC expects", () => {
    expect(seed.incomingTypes).toHaveLength(32);
    expect(seed.outgoingTypes).toHaveLength(23);
    expect(seed.units).toHaveLength(30);
    expect(seed.divisions).toHaveLength(5);
  });

  it("has unique type names", () => {
    const names = (xs: { name: string }[]) =>
      new Set(xs.map((x) => x.name)).size;
    expect(names(seed.incomingTypes)).toBe(seed.incomingTypes.length);
    expect(names(seed.outgoingTypes)).toBe(seed.outgoingTypes.length);
  });

  it("routes every type the seed marks valid to a known unit (C2)", () => {
    const units = new Set(seed.units.map((u) => u.name));
    for (const t of seed.incomingTypes)
      expect(units.has(t.defaultUnit)).toBe(t.defaultUnitValid);
  });

  it("puts every unit in a known division (C1)", () => {
    const divisions = new Set(seed.divisions.map((d) => d.name));
    for (const u of seed.units) expect(divisions).toContain(u.division);
  });

  it("gives every file class a code (C8)", () => {
    for (const c of seed.fileClasses) expect(c.code).toMatch(/^[A-Z]+$/);
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
