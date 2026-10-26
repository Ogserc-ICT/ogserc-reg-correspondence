// Loads every item the user may read, derives it from today's date, and
// counts (SPEC §8.4). One pass feeds both the counters and the breakdowns.
import {
  dashboardBreakdowns,
  type DashboardBreakdowns,
} from "@/domain/breakdowns";
import { dashboardSummary, type DashboardSummary } from "@/domain/dashboard";
import { deriveFile } from "@/domain/files";
import { deriveInward, reg01CacDuplicates } from "@/domain/inward";
import { deriveOutward } from "@/domain/outward";
import type { Principal } from "@/domain/permissions";
import { fileWhere, inwardWhere, outwardWhere } from "./access";
import { fromDbDate } from "./dates";
import type { Db, Tx } from "./db";
import {
  fileFactsInclude,
  inwardFactsInclude,
  outwardFactsInclude,
  toFileFacts,
  toInwardFacts,
  toOutwardFacts,
} from "./facts";
import { loadRuleContext } from "./rules";

async function load(db: Db | Tx, now: Date, user?: Principal) {
  const ctx = await loadRuleContext(db, now);
  const inRows = await db.inwardItem.findMany({
    where: user ? inwardWhere(user) : {},
    include: {
      ...inwardFactsInclude,
      routedUnit: { select: { name: true } },
      senderCategory: { select: { label: true } },
      principalLga: { select: { label: true } },
    },
  });
  const outRows = await db.outwardItem.findMany({
    where: user ? outwardWhere(user) : {},
    include: {
      ...outwardFactsInclude,
      originatingUnit: { select: { name: true } },
      recipientCategory: { select: { label: true } },
    },
  });
  const fileRows = await db.registryFile.findMany({
    where: user ? fileWhere(user) : {},
    include: fileFactsInclude,
  });
  const dupes = reg01CacDuplicates(
    inRows.map((r) => ({
      id: r.id,
      isRegistration: r.snapIsRegistration,
      cacNo: r.cacNo,
      voided: r.voidedAt !== null,
    })),
  );
  const inward = inRows.map((r) => {
    const facts = toInwardFacts(r, dupes.has(r.id));
    return { row: r, facts, derived: deriveInward(facts, ctx) };
  });
  const outward = outRows.map((r) => {
    const facts = toOutwardFacts(r);
    return { row: r, facts, derived: deriveOutward(facts, ctx) };
  });
  const files = fileRows.map((r) => {
    const facts = toFileFacts(r);
    return { facts, derived: deriveFile(facts, ctx) };
  });
  return { ctx, inward, outward, files };
}

export async function loadDashboard(
  db: Db | Tx,
  now: Date,
  user?: Principal,
): Promise<DashboardSummary> {
  const { ctx, inward, outward, files } = await load(db, now, user);
  return dashboardSummary({ today: ctx.today, inward, outward, files });
}

export type FullDashboard = {
  today: string;
  summary: DashboardSummary;
  breakdowns: DashboardBreakdowns;
};

/** Counters and breakdowns for the Dashboard screen. */
export async function loadFullDashboard(
  db: Db,
  now: Date,
  user: Principal,
): Promise<FullDashboard> {
  const { ctx, inward, outward, files } = await load(db, now, user);
  const settings = await db.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  const units = await db.unit.findMany({ orderBy: { sortOrder: "asc" } });
  return {
    today: ctx.today,
    summary: dashboardSummary({ today: ctx.today, inward, outward, files }),
    breakdowns: dashboardBreakdowns({
      units: units.map((u) => u.name),
      firstMonth: fromDbDate(settings.dashboardFirstMonth),
      today: ctx.today,
      inward: inward.map((i) => ({
        voided: i.facts.voided,
        derived: i.derived,
        unit: i.row.routedUnit.name,
        category: i.row.snapCategory,
        type: i.row.snapTypeName,
        senderCategory: i.row.senderCategory.label,
        lga: i.row.principalLga?.label ?? null,
      })),
      outward: outward.map((o) => ({
        voided: o.facts.voided,
        derived: o.derived,
        unit: o.row.originatingUnit.name,
        type: o.row.snapTypeName,
        recipientCategory: o.row.recipientCategory.label,
        documentDate: o.facts.documentDate,
      })),
    }),
  };
}
