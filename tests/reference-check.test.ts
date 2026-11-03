import { describe, expect, it } from "vitest";
import seed from "../seed-data.json";
import { CONFIRMED_DEFAULT_UNITS } from "@/server/v2-decisions";
import {
  checkTypeDefaultUnits,
  resolveTypeDefaultUnits,
  typeDefaultUnitProblems,
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

describe("typeDefaultUnitProblems (admin check)", () => {
  const row = {
    type: "T",
    typeActive: true,
    unit: "U",
    unitActive: true,
    unitHasDivision: true,
  };
  it("is quiet when every active type routes to a current unit with a division", () => {
    expect(typeDefaultUnitProblems([row])).toEqual([]);
    expect(
      typeDefaultUnitProblems([
        { ...row, typeActive: false, unitActive: false },
      ]),
    ).toEqual([]);
  });
  it("names switched-off units and units without a division", () => {
    expect(
      typeDefaultUnitProblems([
        { ...row, unitActive: false },
        { ...row, type: "T2", unitHasDivision: false },
      ]),
    ).toEqual([
      "'T' routes to 'U', which is switched off. Choose a current unit.",
      "'T2' routes to 'U', which has no division. Set its division in Admin › Units.",
    ]);
  });
});
