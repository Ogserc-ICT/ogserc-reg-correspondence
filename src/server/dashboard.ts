// Loads every item, derives it, and counts (SPEC §8.4). With a user, only what
// that user may read is counted. Phase 7 adds the breakdowns.
import { dashboardSummary, type DashboardSummary } from "@/domain/dashboard";
import { deriveFile } from "@/domain/files";
import { deriveInward, reg01CacDuplicates } from "@/domain/inward";
import { deriveOutward } from "@/domain/outward";
import type { Principal } from "@/domain/permissions";
import { fileWhere, inwardWhere, outwardWhere } from "./access";
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

export async function loadDashboard(
  db: Db | Tx,
  now: Date,
  user?: Principal,
): Promise<DashboardSummary> {
  const ctx = await loadRuleContext(db, now);
  const inRows = await db.inwardItem.findMany({
    where: user ? inwardWhere(user) : {},
    include: inwardFactsInclude,
  });
  const outRows = await db.outwardItem.findMany({
    where: user ? outwardWhere(user) : {},
    include: outwardFactsInclude,
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
  const derive = <F, D>(facts: F, fn: (f: F) => D) => ({
    facts,
    derived: fn(facts),
  });
  return dashboardSummary({
    today: ctx.today,
    inward: inRows.map((r) =>
      derive(toInwardFacts(r, dupes.has(r.id)), (f) => deriveInward(f, ctx)),
    ),
    outward: outRows.map((r) =>
      derive(toOutwardFacts(r), (f) => deriveOutward(f, ctx)),
    ),
    files: fileRows.map((r) =>
      derive(toFileFacts(r), (f) => deriveFile(f, ctx)),
    ),
  });
}
