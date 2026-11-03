// Dashboard breakdowns (SPEC §8.4, SPEC-v2 C9). One definition of "pending"
// everywhere (§9 R12, C5.3: Open + Overdue + Awaiting forwarding + Awaiting
// routing). Voided items are left out.
import { addDays, type IsoDate } from "./calendar";
import type { InwardDerived } from "./inward";
import type { OutwardDerived } from "./outward";

export type InwardRow = {
  voided: boolean;
  derived: InwardDerived;
  /** The item's current unit (suggested unit until routed). */
  unit: string;
  /** That unit's division, derived at read time (C1); null if it has none. */
  division: string | null;
  category: string;
  type: string;
  senderCategory: string;
  lga: string | null;
};

export type OutwardRow = {
  voided: boolean;
  derived: OutwardDerived;
  /** Originating unit. */
  unit: string;
  /** The originating unit's division (C7); null if it has none. */
  division: string | null;
  type: string;
  recipientCategory: string;
  documentDate: IsoDate;
};

type Counts<K extends string> = Record<K, number>;
export type Breakdown<K extends string> = ({ label: string } & Counts<K>)[];

/** Groups rows by label and counts each measure; sorted by the first measure, then label. */
function group<T, K extends string>(
  rows: readonly T[],
  labelOf: (r: T) => string,
  measures: Record<K, (r: T) => boolean>,
  fixedLabels: readonly string[] = [],
): Breakdown<K> {
  const keys = Object.keys(measures) as K[];
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as Counts<K>;
  const by = new Map<string, Counts<K>>(fixedLabels.map((l) => [l, zero()]));
  for (const r of rows) {
    const label = labelOf(r);
    const c = by.get(label) ?? zero();
    for (const k of keys) if (measures[k](r)) c[k]++;
    by.set(label, c);
  }
  const out = [...by.entries()].map(([label, c]) => ({ label, ...c }));
  if (!fixedLabels.length)
    out.sort(
      (a, b) => b[keys[0]] - a[keys[0]] || a.label.localeCompare(b.label),
    );
  return out;
}

/** "2026-11" for the 24 months from the first dashboard month (§8.4). */
export function dashboardMonths(firstMonth: IsoDate, count = 24): string[] {
  const [y, m] = firstMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const mm = m - 1 + i;
    return `${y + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, "0")}`;
  });
}

export function dashboardBreakdowns(input: {
  inward: readonly InwardRow[];
  outward: readonly OutwardRow[];
  units: readonly string[];
  /** Every division, listed even with no items (C9). */
  divisions?: readonly string[];
  firstMonth: IsoDate;
  today: IsoDate;
}) {
  const inward = input.inward.filter((r) => !r.voided);
  const outward = input.outward.filter((r) => !r.voided);
  const monthOf = (d: IsoDate) => d.slice(0, 7);
  // Up to 24 months from the first dashboard month, ending at this month or
  // the latest month with items, so the chart never plots an empty future.
  const latest = [
    monthOf(input.today),
    ...inward.map((r) => monthOf(r.derived.deemedReceiptDate)),
    ...outward.map((r) => monthOf(r.documentDate)),
  ]
    .sort()
    .at(-1)!;
  const allMonths = dashboardMonths(input.firstMonth);
  const end = allMonths.indexOf(latest);
  const months =
    end === -1
      ? latest > allMonths[0]
        ? allMonths
        : allMonths.slice(0, 1)
      : allMonths.slice(0, end + 1);
  const pending = (r: InwardRow) => r.derived.pending;
  const overdue = (r: InwardRow) => r.derived.status === "Overdue";
  const closed = (r: InwardRow) => r.derived.status === "Closed";

  // Units: inward and outward counted side by side, every unit listed.
  const unitRows = input.units.map((label) => {
    const inn = inward.filter((r) => r.unit === label);
    return {
      label,
      inwardRouted: inn.length,
      pending: inn.filter(pending).length,
      overdue: inn.filter(overdue).length,
      closed: inn.filter(closed).length,
      outwardOriginated: outward.filter((r) => r.unit === label).length,
    };
  });

  // Divisions (C9): inward by the division of the current unit; outward by
  // the division of the originating unit.
  const divisionRows = (input.divisions ?? []).map((label) => {
    const inn = inward.filter((r) => r.division === label);
    return {
      label,
      inwardRouted: inn.length,
      pending: inn.filter(pending).length,
      overdue: inn.filter(overdue).length,
      closed: inn.filter(closed).length,
      outwardOriginated: outward.filter((r) => r.division === label).length,
    };
  });

  return {
    byUnit: unitRows,
    byDivision: divisionRows,
    byCategory: group(inward, (r) => r.category, {
      received: () => true,
      pending,
      overdue,
    }),
    byMonth: months.map((month) => ({
      month,
      inward: inward.filter(
        (r) => monthOf(r.derived.deemedReceiptDate) === month,
      ).length,
      outward: outward.filter((r) => monthOf(r.documentDate) === month).length,
    })),
    byCorrespondent: {
      inward: group(inward, (r) => r.senderCategory, { received: () => true }),
      outward: group(outward, (r) => r.recipientCategory, { sent: () => true }),
    },
    outgoingByType: group(outward, (r) => r.type, {
      logged: () => true,
      notYetDispatched: (r) => r.derived.status === "Not yet dispatched",
      responseOverdue: (r) => r.derived.status === "Response overdue",
    }),
    incomingByType: group(inward, (r) => r.type, {
      received: () => true,
      pending,
      overdue,
      closed,
    }),
    incomingByLga: group(
      inward.filter((r) => r.lga),
      (r) => r.lga!,
      { received: () => true },
    ),
  };
}

export type DashboardBreakdowns = ReturnType<typeof dashboardBreakdowns>;

/** The last day of the 24-month window, for the chart caption. */
export function lastDashboardDay(firstMonth: IsoDate): IsoDate {
  const months = dashboardMonths(firstMonth, 25);
  return addDays(`${months[24]}-01`, -1);
}
