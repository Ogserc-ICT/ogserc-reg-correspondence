// One-off upgrade of an existing database's reference data to v2
// (docs/V2_GAP_REPORT.md §2). The seed only fills empty tables, so a database
// seeded before v2 (production: reference data and accounts, no items) needs
// this instead of a reseed.
//
// - Everything runs in ONE transaction: all of it applies, or none of it.
// - Dry run (the default) does the whole job, reports it, then rolls back.
// - Idempotent: a second run reports no changes.
// - Nothing is deleted. Old units are switched off after every reference to
//   them has moved to the C1.1 unit. Admin edits to v2 rows are kept.
// - Every change is audited as "upgrade-reference-v2".
import { createHash } from "node:crypto";
import seed from "../../seed-data.json";
import { normaliseEmails } from "../../src/domain/emails";
import { resolveTypeDefaultUnits } from "../../src/domain/reference-check";
import type { Prisma } from "../../src/generated/prisma/client";
import { audit } from "../../src/server/audit";
import type { Db, Tx } from "../../src/server/db";
import { typeUnitProblems } from "../../src/server/reference";
import {
  CONFIRMED_DEFAULT_UNITS,
  SPLIT_TYPE,
  UNIT_RENAME_MAP,
} from "../../src/server/v2-decisions";
import { incomingTypeRow } from "./reference";

export const UPGRADE_ACTION = "upgrade-reference-v2";

export type Change = {
  entity: string;
  name: string;
  change: "create" | "update" | "remap" | "deactivate" | "rename";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

export type UpgradeReport = {
  committed: boolean;
  /** Identifies this exact set of changes; --commit needs it as --confirm. */
  fingerprint: string;
  changes: Change[];
  /** Admin checks still failing after the upgrade (e.g. a type's unit). */
  warnings: string[];
};

class DryRun extends Error {}

const emailsOf = (xs: readonly string[]) => normaliseEmails(xs).emails;

export class NotConfirmedError extends Error {}

/** Short hash of the planned changes, shown by the dry run. */
export function fingerprintOf(changes: readonly Change[]): string {
  return createHash("sha256")
    .update(JSON.stringify(changes))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Dry run unless `commit` is set. A commit must carry the fingerprint the dry
 * run printed (`confirm`); if the planned changes differ in any way (someone
 * edited the data since), nothing is saved.
 */
export async function upgradeReferenceV2(
  db: Db,
  now: Date,
  { commit, confirm }: { commit: boolean; confirm?: string },
): Promise<UpgradeReport> {
  const report: UpgradeReport = {
    committed: false,
    fingerprint: "",
    changes: [],
    warnings: [],
  };
  try {
    await db.$transaction(
      async (tx) => {
        report.changes = await upgrade(tx, now);
        report.fingerprint = fingerprintOf(report.changes);
        report.warnings = await typeUnitProblems(tx);
        if (!commit) throw new DryRun();
        if (confirm !== report.fingerprint)
          throw new NotConfirmedError(
            confirm
              ? `--confirm ${confirm} does not match the planned changes (${report.fingerprint}). Run the dry run again and review it.`
              : "Run the dry run first, review it, then pass --confirm with the fingerprint it prints.",
          );
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    report.committed = true;
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  return report;
}

async function upgrade(tx: Tx, now: Date): Promise<Change[]> {
  if (!(await tx.registrySettings.findUnique({ where: { id: 1 } })))
    throw new Error(
      "This database has no settings row: it was never seeded. Run the seed instead.",
    );
  const changes: Change[] = [];
  const record = async (
    c: Change,
    entityType: string,
    entityId: string,
  ): Promise<void> => {
    changes.push(c);
    await audit(
      tx,
      {
        userId: null,
        action: UPGRADE_ACTION,
        entityType,
        entityId,
        before: c.before,
        after: c.after,
        note: `${c.change}: ${c.name}`,
      },
      now,
    );
  };

  // 1. Divisions (C1): add the missing ones; existing ones are kept as edited.
  for (const [i, d] of seed.divisions.entries()) {
    if (await tx.division.findUnique({ where: { name: d.name } })) continue;
    const row = await tx.division.create({
      data: { name: d.name, emails: emailsOf(d.emails), sortOrder: i },
    });
    await record(
      {
        entity: "Division",
        name: d.name,
        change: "create",
        before: null,
        after: { emails: row.emails },
      },
      "Division",
      row.id,
    );
  }
  const divisionId = new Map(
    (await tx.division.findMany()).map((d) => [d.name, d.id]),
  );

  // 2. The 30 v2 units: create missing ones; fill blanks on existing ones.
  for (const [i, u] of seed.units.entries()) {
    const existing = await tx.unit.findUnique({ where: { name: u.name } });
    const want = {
      divisionId: divisionId.get(u.division)!,
      unitGroup: u.unitGroup,
      emails: emailsOf(u.emails),
    };
    if (!existing) {
      const row = await tx.unit.create({
        data: { name: u.name, ...want, sortOrder: 100 + i },
      });
      await record(
        {
          entity: "Unit",
          name: u.name,
          change: "create",
          before: null,
          after: {
            division: u.division,
            unitGroup: u.unitGroup,
            emails: row.emails,
          },
        },
        "Unit",
        row.id,
      );
      continue;
    }
    const data: Prisma.UnitUncheckedUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (!existing.divisionId) {
      data.divisionId = want.divisionId;
      before.division = null;
      after.division = u.division;
    }
    if (!existing.unitGroup) {
      data.unitGroup = want.unitGroup;
      before.unitGroup = existing.unitGroup;
      after.unitGroup = want.unitGroup;
    }
    if (existing.emails.length === 0 && want.emails.length > 0) {
      data.emails = want.emails;
      before.emails = existing.emails;
      after.emails = want.emails;
    }
    if (Object.keys(data).length === 0) continue;
    await tx.unit.update({ where: { id: existing.id }, data });
    await record(
      { entity: "Unit", name: u.name, change: "update", before, after },
      "Unit",
      existing.id,
    );
  }

  const units = await tx.unit.findMany();
  const unitByName = new Map(units.map((u) => [u.name, u]));
  const v2UnitNames = new Set(seed.units.map((u) => u.name));
  /** Old (v1) units still present, with the unit they become (C1.1). */
  const oldUnits = Object.entries(UNIT_RENAME_MAP)
    .filter(([from]) => !v2UnitNames.has(from) && unitByName.has(from))
    .map(([from, to]) => ({
      from: unitByName.get(from)!,
      to: unitByName.get(to)!,
    }));
  const oldUnitIds = new Map(oldUnits.map((o) => [o.from.id, o]));

  // 3. Incoming types (C2).
  //    a. v1's "Consumer petition / public representation" becomes "Consumer petition".
  const split = await tx.incomingType.findUnique({
    where: { name: SPLIT_TYPE.old },
  });
  if (
    split &&
    !(await tx.incomingType.findUnique({
      where: { name: SPLIT_TYPE.renamedTo },
    }))
  ) {
    await tx.incomingType.update({
      where: { id: split.id },
      data: { name: SPLIT_TYPE.renamedTo },
    });
    await record(
      {
        entity: "IncomingType",
        name: SPLIT_TYPE.old,
        change: "rename",
        before: { name: SPLIT_TYPE.old },
        after: { name: SPLIT_TYPE.renamedTo },
      },
      "IncomingType",
      split.id,
    );
  }
  //    b. Types still routed to an old unit take their v2 default (or, for a
  //       type not in v2, the C1.1 unit). Types already on a v2 unit are left
  //       alone, so admin edits survive a second run.
  const resolved = resolveTypeDefaultUnits(
    seed.incomingTypes,
    unitByName.keys(),
    CONFIRMED_DEFAULT_UNITS,
  );
  if (resolved.missing.length)
    throw new Error(
      `Incoming types point at units that do not exist: ${resolved.missing
        .map((m) => `'${m.type}' → '${m.defaultUnit}'`)
        .join("; ")}`,
    );
  const seedTypes = new Map(seed.incomingTypes.map((t) => [t.name, t]));
  for (const t of await tx.incomingType.findMany()) {
    const old = oldUnitIds.get(t.defaultUnitId);
    if (!old) continue;
    const toName = seedTypes.has(t.name)
      ? resolved.unitByType.get(t.name)!
      : old.to.name;
    const to = unitByName.get(toName)!;
    await tx.incomingType.update({
      where: { id: t.id },
      data: { defaultUnitId: to.id },
    });
    await record(
      {
        entity: "IncomingType",
        name: t.name,
        change: "update",
        before: { defaultUnit: old.from.name },
        after: { defaultUnit: to.name },
      },
      "IncomingType",
      t.id,
    );
  }
  //    c. Types new in v2.
  for (const [i, t] of seed.incomingTypes.entries()) {
    if (await tx.incomingType.findUnique({ where: { name: t.name } })) continue;
    const unit = unitByName.get(resolved.unitByType.get(t.name)!)!;
    const row = await tx.incomingType.create({
      data: incomingTypeRow(t, unit.id, i),
    });
    await record(
      {
        entity: "IncomingType",
        name: t.name,
        change: "create",
        before: null,
        after: {
          defaultUnit: unit.name,
          responseTargetDays: t.responseTargetDays,
        },
      },
      "IncomingType",
      row.id,
    );
  }

  // 4. Everything else that points at an old unit moves to its C1.1 unit;
  //    then the old unit is switched off (never deleted).
  for (const { from, to } of oldUnits) {
    for (const u of await tx.user.findMany({ where: { unitId: from.id } })) {
      await tx.user.update({ where: { id: u.id }, data: { unitId: to.id } });
      await record(
        {
          entity: "User",
          name: `${u.name} <${u.email}>`,
          change: "remap",
          before: { unit: from.name },
          after: { unit: to.name },
        },
        "User",
        u.id,
      );
    }
    const counts = {
      incomingTypes: (
        await tx.incomingType.updateMany({
          where: { defaultUnitId: from.id },
          data: { defaultUnitId: to.id },
        })
      ).count,
      inwardOverride: (
        await tx.inwardItem.updateMany({
          where: { unitOverrideId: from.id },
          data: { unitOverrideId: to.id },
        })
      ).count,
      inwardRouted: (
        await tx.inwardItem.updateMany({
          where: { routedUnitId: from.id },
          data: { routedUnitId: to.id },
        })
      ).count,
      inwardSnapshot: (
        await tx.inwardItem.updateMany({
          where: { snapDefaultUnitId: from.id },
          data: { snapDefaultUnitId: to.id },
        })
      ).count,
      outwardOriginating: (
        await tx.outwardItem.updateMany({
          where: { originatingUnitId: from.id },
          data: { originatingUnitId: to.id },
        })
      ).count,
      filesOwned: (
        await tx.registryFile.updateMany({
          where: { owningUnitId: from.id },
          data: { owningUnitId: to.id },
        })
      ).count,
      movements: (
        await tx.fileMovement.updateMany({
          where: { unitId: from.id },
          data: { unitId: to.id },
        })
      ).count,
    };
    const moved = Object.fromEntries(
      Object.entries(counts).filter(([, n]) => n > 0),
    );
    if (Object.keys(moved).length)
      await record(
        {
          entity: "Unit",
          name: from.name,
          change: "remap",
          before: { unit: from.name },
          after: { unit: to.name, rows: moved },
        },
        "Unit",
        from.id,
      );
    if (from.active) {
      await tx.unit.update({ where: { id: from.id }, data: { active: false } });
      await record(
        {
          entity: "Unit",
          name: from.name,
          change: "deactivate",
          before: { active: true },
          after: { active: false, replacedBy: to.name },
        },
        "Unit",
        from.id,
      );
    }
  }

  // 5. File class codes (C8), where an existing class has none.
  for (const c of seed.fileClasses) {
    const item = await tx.listItem.findUnique({
      where: { list_label: { list: "FILE_CLASS", label: c.name } },
    });
    if (!item || item.code) continue;
    await tx.listItem.update({
      where: { id: item.id },
      data: { code: c.code },
    });
    await record(
      {
        entity: "FileClass",
        name: c.name,
        change: "update",
        before: { code: null },
        after: { code: c.code },
      },
      "ListItem",
      item.id,
    );
  }

  // 6. Signatory list (C7), only if there is none yet. No user accounts.
  if ((await tx.signatory.count()) === 0)
    for (const [i, p] of seed.staffFromWorkbook.signatories.entries()) {
      const row = await tx.signatory.create({
        data: {
          name: p.name,
          designation: p.designation,
          isDefault: p.designation === "Secretary to the Commission",
          sortOrder: i,
        },
      });
      await record(
        {
          entity: "Signatory",
          name: p.name,
          change: "create",
          before: null,
          after: { designation: p.designation, isDefault: row.isDefault },
        },
        "Signatory",
        row.id,
      );
    }

  return changes;
}

/** Plain-text report for the CLI. */
export function formatReport(r: UpgradeReport, target: string): string {
  const lines = [
    `upgrade-reference-v2 on ${target}`,
    r.committed
      ? "COMMITTED: the changes below are saved."
      : "DRY RUN: nothing was saved. The changes below are what --commit --confirm would do.",
    "",
  ];
  if (!r.changes.length)
    lines.push("No changes: the database is already on v2 reference data.");
  const show = (o: Record<string, unknown> | null) =>
    o === null ? "—" : JSON.stringify(o);
  for (const c of r.changes)
    lines.push(
      `${c.change.padEnd(10)} ${c.entity.padEnd(13)} ${c.name}\n${" ".repeat(11)}before: ${show(c.before)}\n${" ".repeat(11)}after:  ${show(c.after)}`,
    );
  lines.push(
    "",
    `${r.changes.length} change(s). Fingerprint: ${r.fingerprint}`,
  );
  if (!r.committed && r.changes.length)
    lines.push(
      `To apply exactly these changes: --commit --confirm ${r.fingerprint}`,
    );
  if (r.warnings.length)
    lines.push(
      "",
      "Still to check on Admin › Types:",
      ...r.warnings.map((w) => `- ${w}`),
    );
  return lines.join("\n");
}
