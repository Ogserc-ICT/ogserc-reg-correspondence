import { describe, expect, it } from "vitest";
import seed from "../seed-data.json";
import { CONFIRMED_DEFAULT_UNITS } from "@/server/v2-decisions";
import {
  checkTypeDefaultUnits,
  resolveTypeDefaultUnits,
} from "@/domain/reference-check";

const unitNames = seed.units.map((u) => u.name);

describe("type default units (C2, E2)", () => {
  it("V13: reports the two workbook types that point at non-existent units", () => {
    expect(checkTypeDefaultUnits(seed.incomingTypes, unitNames)).toEqual([
      {
        type: "Licensee returns / performance report",
        defaultUnit: "Performance Monitoring unit, Market Analysis",
      },
      {
        type: "Incident / outage report",
        defaultUnit:
          "Performance Monitoring unit, Occupational Health and Safety",
      },
    ]);
  });

  it("matches the seed's own defaultUnitValid flags", () => {
    const bad = new Set(
      checkTypeDefaultUnits(seed.incomingTypes, unitNames).map((p) => p.type),
    );
    for (const t of seed.incomingTypes)
      expect(bad.has(t.name)).toBe(!t.defaultUnitValid);
  });

  it("uses the confirmed replacements and leaves nothing unresolved", () => {
    const r = resolveTypeDefaultUnits(
      seed.incomingTypes,
      unitNames,
      CONFIRMED_DEFAULT_UNITS,
    );
    expect(r.missing).toEqual([]);
    expect(r.unitByType.size).toBe(32);
    expect(r.replaced.map((x) => x.to)).toEqual([
      "Performance Monitoring unit",
      "Occupational Health, Safety and Performance Analysis unit",
    ]);
  });

  it("never invents a unit: no replacement → reported missing", () => {
    const r = resolveTypeDefaultUnits(
      [{ name: "X", defaultUnit: "Nowhere" }],
      unitNames,
      { X: "Also nowhere" },
    );
    expect(r.missing).toEqual([{ type: "X", defaultUnit: "Nowhere" }]);
    expect(r.unitByType.size).toBe(0);
  });
});
