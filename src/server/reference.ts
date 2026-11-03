// Reference data the Head of Registry maintains (SPEC §1, §10; CLAUDE.md
// Phase 8): incoming and outgoing types, simple lists, units, public
// holidays. Every change is audited with old and new values. Items keep the
// type rules they were saved with (STACK rule 10); holiday changes move open
// deadlines, so statuses are refreshed straight away.
import { isIsoDate } from "@/domain/calendar";
import { typeDefaultUnitProblems } from "@/domain/reference-check";
import type {
  HolidayStatus,
  ListKind,
  Prisma,
  SlipFooter,
} from "@/generated/prisma/client";
import { audit, changedFields } from "./audit";
import { fromDbDate, toDbDate } from "./dates";
import type { Db, Tx } from "./db";
import { assertCan, ValidationError } from "./errors";
import { runJob } from "./jobs";
import type { Actor } from "./registers";
import { Reader, type Raw } from "./workflows/common";

export const LIST_KINDS: { kind: ListKind; title: string }[] = [
  { kind: "RECEIPT_MODE", title: "Modes of receipt / dispatch" },
  { kind: "PARTY_CATEGORY", title: "Correspondent categories" },
  { kind: "ACTION_REQUIRED", title: "Action required" },
  { kind: "PRIORITY", title: "Priorities" },
  { kind: "ACK_VIA", title: "Acknowledgement issued via" },
  { kind: "LGA", title: "Local government areas" },
  { kind: "FILE_CLASS", title: "File classes" },
  { kind: "FILE_SECURITY", title: "File security" },
  { kind: "FILE_STATUS", title: "File status" },
];

const FOOTERS: SlipFooter[] = ["REGISTRATION", "PARA103", "GENERAL"];
const HOLIDAY_STATUSES: HolidayStatus[] = ["FIXED", "PROVISIONAL", "ESTIMATED"];

function fail(problems: string[]): never {
  throw new ValidationError(problems);
}

function plain<T extends object>(o: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      v instanceof Date ? fromDbDate(v) : v,
    ]),
  );
}

async function record(
  tx: Tx,
  actor: Actor,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) {
  const diff = before ? changedFields(before, after) : { before: null, after };
  if (before && !Object.keys(diff.after).length) return false;
  await audit(
    tx,
    {
      userId: actor.user.id,
      action: before ? "reference-update" : "reference-create",
      entityType,
      entityId,
      before: diff.before,
      after: diff.after,
    },
    actor.now,
  );
  return true;
}

/**
 * C2/V13: active incoming types whose default unit is switched off or has no
 * division. Shown on Admin › Types and logged at start-up. No permission
 * check: it returns only type and unit names.
 */
export async function typeUnitProblems(db: Db | Tx): Promise<string[]> {
  const types = await db.incomingType.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      name: true,
      active: true,
      defaultUnit: { select: { name: true, active: true, divisionId: true } },
    },
  });
  return typeDefaultUnitProblems(
    types.map((t) => ({
      type: t.name,
      typeActive: t.active,
      unit: t.defaultUnit.name,
      unitActive: t.defaultUnit.active,
      unitHasDivision: t.defaultUnit.divisionId !== null,
    })),
  );
}

export async function loadReference(db: Db, actor: Actor) {
  assertCan(actor.user, "reference.manage");
  return {
    incomingTypes: await db.incomingType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { defaultUnit: { select: { name: true } } },
    }),
    outgoingTypes: await db.outgoingType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    listItems: await db.listItem.findMany({
      orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    }),
    units: await db.unit.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    holidays: await db.publicHoliday.findMany({ orderBy: { date: "asc" } }),
  };
}

// ------------------------------------------------------------------ types ---

export async function saveIncomingType(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertCan(actor.user, "reference.manage");
  const r = new Reader(raw);
  const data = {
    name: r.text("name"),
    category: r.text("category"),
    defaultUnitId: r.id("defaultUnitId", "Default unit"),
    orderRef: r.text("orderRef"),
    responseTargetDays: r.int("responseTargetDays", "Response target"),
    para103SlipWording: r.checkbox("para103SlipWording"),
    slipFooter: (raw.slipFooter ?? "") as SlipFooter,
    isRegistration: r.checkbox("isRegistration"),
    requiresRelatedOgsercNo: r.checkbox("requiresRelatedOgsercNo"),
    active: r.checkbox("active"),
    sortOrder: r.int("sortOrder", "Order") ?? 0,
  };
  const p = [...r.problems];
  if (!data.name) p.push("Enter the type's name.");
  if (!data.category) p.push("Enter a category.");
  if (!data.defaultUnitId) p.push("Choose the default unit.");
  if (data.responseTargetDays === null)
    p.push("Enter the response target in working days (0 for none).");
  else if (data.responseTargetDays > 365)
    p.push("Response target: at most 365 working days.");
  if (!FOOTERS.includes(data.slipFooter)) p.push("Choose the slip footer.");
  if (p.length) fail(p);

  return db.$transaction(async (tx) => {
    const clash = await tx.incomingType.findFirst({
      where: {
        name: { equals: data.name!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`There is already a type called ${clash.name}.`]);
    const values = {
      ...data,
      name: data.name!,
      category: data.category!,
      defaultUnitId: data.defaultUnitId!,
      responseTargetDays: data.responseTargetDays!,
    };
    if (id) {
      const before = await tx.incomingType.findUniqueOrThrow({ where: { id } });
      const after = await tx.incomingType.update({
        where: { id },
        data: values,
      });
      await record(tx, actor, "IncomingType", id, plain(before), plain(after));
      return {
        message: `${after.name} saved. Items already logged keep the rules they were saved with.`,
      };
    }
    const created = await tx.incomingType.create({ data: values });
    await record(tx, actor, "IncomingType", created.id, null, plain(created));
    return { message: `${created.name} added.` };
  });
}

export async function saveOutgoingType(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertCan(actor.user, "reference.manage");
  const r = new Reader(raw);
  const data = {
    name: r.text("name"),
    responseExpected: r.checkbox("responseExpected"),
    responseWindowDays: r.int("responseWindowDays", "Response window") ?? 0,
    closesInwardItem: r.checkbox("closesInwardItem"),
    active: r.checkbox("active"),
    sortOrder: r.int("sortOrder", "Order") ?? 0,
  };
  const p = [...r.problems];
  if (!data.name) p.push("Enter the document type's name.");
  if (data.responseWindowDays > 365)
    p.push("Response window: at most 365 working days.");
  if (p.length) fail(p);
  return db.$transaction(async (tx) => {
    const clash = await tx.outgoingType.findFirst({
      where: {
        name: { equals: data.name!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`There is already a document type called ${clash.name}.`]);
    const values = { ...data, name: data.name! };
    if (id) {
      const before = await tx.outgoingType.findUniqueOrThrow({ where: { id } });
      const after = await tx.outgoingType.update({
        where: { id },
        data: values,
      });
      await record(tx, actor, "OutgoingType", id, plain(before), plain(after));
      return {
        message: `${after.name} saved. Letters already logged keep the rules they were saved with.`,
      };
    }
    const created = await tx.outgoingType.create({ data: values });
    await record(tx, actor, "OutgoingType", created.id, null, plain(created));
    return { message: `${created.name} added.` };
  });
}

// ------------------------------------------------------------ lists, units ---

export async function saveListItem(
  db: Db,
  actor: Actor,
  list: ListKind,
  id: string | null,
  raw: Raw,
) {
  assertCan(actor.user, "reference.manage");
  if (!LIST_KINDS.some((l) => l.kind === list)) fail(["Unknown list."]);
  const r = new Reader(raw);
  const label = r.text("label");
  const active = r.checkbox("active");
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  const modes = list === "RECEIPT_MODE";
  const extra = modes
    ? {
        afterHoursCutoff: r.checkbox("afterHoursCutoff"),
        noDeliveryConfirmation: r.checkbox("noDeliveryConfirmation"),
      }
    : {};
  const p = [...r.problems];
  if (!label) p.push("Enter the value.");
  if (p.length) fail(p);
  return db.$transaction(async (tx) => {
    const clash = await tx.listItem.findFirst({
      where: {
        list,
        label: { equals: label!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`"${clash.label}" is already in this list.`]);
    if (id) {
      const before = await tx.listItem.findUniqueOrThrow({ where: { id } });
      if (before.list !== list) fail(["Unknown list value."]);
      if (before.systemKey && !active)
        fail([
          `"${before.label}" is used by the Registry's rules, so it can be renamed but not switched off.`,
        ]);
      const after = await tx.listItem.update({
        where: { id },
        data: { label: label!, active, sortOrder, ...extra },
      });
      await record(tx, actor, "ListItem", id, plain(before), plain(after));
      return { message: `${after.label} saved.` };
    }
    const created = await tx.listItem.create({
      data: { list, label: label!, active, sortOrder, ...extra },
    });
    await record(tx, actor, "ListItem", created.id, null, plain(created));
    return { message: `${created.label} added.` };
  });
}

export async function saveUnit(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertCan(actor.user, "reference.manage");
  const r = new Reader(raw);
  const name = r.text("name");
  const active = r.checkbox("active");
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  if (!name) fail(["Enter the unit's name."]);
  return db.$transaction(async (tx) => {
    const clash = await tx.unit.findFirst({
      where: {
        name: { equals: name!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`There is already a unit called ${clash.name}.`]);
    if (id) {
      const before = await tx.unit.findUniqueOrThrow({ where: { id } });
      if (before.active && !active) {
        const types = await tx.incomingType.count({
          where: { defaultUnitId: id, active: true },
        });
        const officers = await tx.user.count({
          where: { unitId: id, active: true },
        });
        if (types || officers)
          fail([
            `${before.name} can't be switched off while ${types} active type(s) route to it and ${officers} unit officer(s) belong to it.`,
          ]);
      }
      const after = await tx.unit.update({
        where: { id },
        data: { name: name!, active, sortOrder },
      });
      await record(tx, actor, "Unit", id, plain(before), plain(after));
      return { message: `${after.name} saved.` };
    }
    const created = await tx.unit.create({
      data: { name: name!, active, sortOrder },
    });
    await record(tx, actor, "Unit", created.id, null, plain(created));
    return { message: `${created.name} added.` };
  });
}

// --------------------------------------------------------------- holidays ---

async function afterHolidayChange(db: Db, actor: Actor) {
  // Due dates and overdue status depend on the holiday table.
  await runJob(db, "refresh-status", actor.now, actor.user.id);
}

export async function saveHoliday(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertCan(actor.user, "reference.manage");
  const r = new Reader(raw);
  const date = r.date("date", "Date");
  const name = r.text("name");
  const status = (raw.status ?? "") as HolidayStatus;
  const note = r.text("note");
  const p = [...r.problems];
  if (!date || !isIsoDate(date)) p.push("Enter the date.");
  if (!name) p.push("Enter the holiday's name.");
  if (!HOLIDAY_STATUSES.includes(status))
    p.push("Choose Fixed, Provisional or Estimated.");
  if (p.length) fail(p);
  const data: Prisma.PublicHolidayUncheckedCreateInput = {
    date: toDbDate(date!),
    name: name!,
    status,
    note,
  };
  const message = await db.$transaction(async (tx) => {
    const clash = await tx.publicHoliday.findFirst({
      where: { date: toDbDate(date!), ...(id ? { id: { not: id } } : {}) },
    });
    if (clash) fail([`${date} is already a holiday (${clash.name}).`]);
    if (id) {
      const before = await tx.publicHoliday.findUniqueOrThrow({
        where: { id },
      });
      const after = await tx.publicHoliday.update({ where: { id }, data });
      await record(tx, actor, "PublicHoliday", id, plain(before), plain(after));
      return `${after.name} saved. Deadlines have been recalculated.`;
    }
    const created = await tx.publicHoliday.create({ data });
    await record(tx, actor, "PublicHoliday", created.id, null, plain(created));
    return `${created.name} added. Deadlines have been recalculated.`;
  });
  await afterHolidayChange(db, actor);
  return { message };
}

/** A holiday that was announced but not declared can be removed. */
export async function deleteHoliday(db: Db, actor: Actor, id: string) {
  assertCan(actor.user, "reference.manage");
  const message = await db.$transaction(async (tx) => {
    const before = await tx.publicHoliday.findUniqueOrThrow({ where: { id } });
    await tx.publicHoliday.delete({ where: { id } });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "reference-delete",
        entityType: "PublicHoliday",
        entityId: id,
        before: plain(before),
      },
      actor.now,
    );
    return `${before.name} (${fromDbDate(before.date)}) removed. Deadlines have been recalculated.`;
  });
  await afterHolidayChange(db, actor);
  return { message };
}
