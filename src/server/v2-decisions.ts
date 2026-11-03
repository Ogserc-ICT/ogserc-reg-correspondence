// Decisions taken on the v2 reference data (docs/V2_GAP_REPORT.md §1).
// Kept apart from seed-data.json, which is the workbook extract as handed over.

/**
 * C2: two incoming types in the workbook name units that do not exist
 * (seed flags them `defaultUnitValid: false`). Confirmed replacements; both
 * stay admin-editable and are on docs/GO_LIVE_CHECKLIST.md.
 */
export const CONFIRMED_DEFAULT_UNITS: Readonly<Record<string, string>> = {
  "Licensee returns / performance report": "Performance Monitoring unit",
  "Incident / outage report":
    "Occupational Health, Safety and Performance Analysis unit",
};

/** C1.1: old (v1) unit → new unit. Confirmed as written (Q-V2-4). */
export const UNIT_RENAME_MAP: Readonly<Record<string, string>> = {
  "Office of the Chairman":
    "Office of the General Counsel and Secretary (Registry)",
  "Office of the Secretary":
    "Office of the General Counsel and Secretary (Registry)",
  "Registration & Licensing": "Licensing unit",
  "Technical & Market Operations": "Performance Monitoring unit",
  "Tariffs & Economic Regulation": "Tariff and Rates unit",
  "Consumer Affairs": "Customer Complaints",
  Legal: "Compliance/Legal Services unit: Legal",
  Finance: "Finance and Account unit",
  "Administration & HR": "Human Resources",
  "Corporate Communications":
    "Public Affairs and Stakeholder unit: Communication",
};

/** C2: the v1 type that v2 splits in two. */
export const SPLIT_TYPE = {
  old: "Consumer petition / public representation",
  renamedTo: "Consumer petition",
  added: "Public representation",
} as const;
