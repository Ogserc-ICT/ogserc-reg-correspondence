// Organisation (SPEC-v2 C1, C7, C8, C12): divisions and units with their
// email addresses, the outward signatory list, and file class codes. Admin
// (and the Head of Registry, who kept the units) maintain them; every change
// is audited with old and new values; nothing is ever deleted.
import { normaliseEmails } from "@/domain/emails";
import { can } from "@/domain/permissions";
import type { Db, Tx } from "./db";
import { ForbiddenError } from "./errors";
import { fail, plain, record } from "./reference";
import type { Actor } from "./registers";
import { Reader, type Raw } from "./workflows/common";

const NOT_ALLOWED = "You don't have permission to do that.";

function assertOrganisation(actor: Actor) {
  if (!can(actor.user, "organisation.manage"))
    throw new ForbiddenError(NOT_ALLOWED);
}

/** "a@x.ng; B@x.ng" → ["a@x.ng", "b@x.ng"], or the problem (C1, Q-V2-6). */
function emailsOf(raw: Raw, label: string): string[] {
  const { emails, invalid } = normaliseEmails(raw.emails ?? "");
  if (invalid.length)
    fail([`${label}: not an email address: ${invalid.join(", ")}.`]);
  return emails;
}

export async function loadOrganisation(db: Db, actor: Actor) {
  assertOrganisation(actor);
  const [divisions, units, signatories, fileClasses] = await Promise.all([
    db.division.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.unit.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { division: { select: { name: true } } },
    }),
    db.signatory.findMany({
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.listItem.findMany({
      where: { list: "FILE_CLASS" },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
  ]);
  return { divisions, units, signatories, fileClasses };
}

// -------------------------------------------------------------- divisions ---

export async function saveDivision(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertOrganisation(actor);
  const r = new Reader(raw);
  const name = r.text("name");
  const active = r.checkbox("active");
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  if (!name) fail(["Enter the division's name."]);
  if (r.problems.length) fail(r.problems);
  const emails = emailsOf(raw, "Email addresses");
  return db.$transaction(async (tx) => {
    const clash = await tx.division.findFirst({
      where: {
        name: { equals: name!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`There is already a division called ${clash.name}.`]);
    const data = { name: name!, emails, active, sortOrder };
    if (id) {
      const before = await tx.division.findUniqueOrThrow({ where: { id } });
      if (before.active && !active) {
        const units = await tx.unit.count({
          where: { divisionId: id, active: true },
        });
        if (units)
          fail([
            `${before.name} can't be switched off while ${units} unit(s) in use belong to it.`,
          ]);
      }
      const after = await tx.division.update({ where: { id }, data });
      await record(tx, actor, "Division", id, plain(before), plain(after));
      return { message: `${after.name} saved.` };
    }
    const created = await tx.division.create({ data });
    await record(tx, actor, "Division", created.id, null, plain(created));
    return { message: `${created.name} added.` };
  });
}

// ------------------------------------------------------------------ units ---

export async function saveUnit(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertOrganisation(actor);
  const r = new Reader(raw);
  const name = r.text("name");
  const divisionId = r.id("divisionId", "Division");
  const unitGroup = r.text("unitGroup");
  const active = r.checkbox("active");
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  const p = [...r.problems];
  if (!name) p.push("Enter the unit's name.");
  // C1: every unit belongs to a division (the dashboard groups by it).
  if (!divisionId && !r.problems.length) p.push("Choose the unit's division.");
  if (p.length) fail(p);
  const emails = emailsOf(raw, "Email addresses");
  return db.$transaction(async (tx) => {
    const clash = await tx.unit.findFirst({
      where: {
        name: { equals: name!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`There is already a unit called ${clash.name}.`]);
    const division = await tx.division.findUnique({
      where: { id: divisionId! },
    });
    if (!division || (!division.active && active))
      fail(["Division: choose a value from the list."]);
    const data = {
      name: name!,
      divisionId,
      unitGroup,
      emails,
      active,
      sortOrder,
    };
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
      const after = await tx.unit.update({ where: { id }, data });
      await record(tx, actor, "Unit", id, plain(before), plain(after));
      return { message: `${after.name} saved.` };
    }
    const created = await tx.unit.create({ data });
    await record(tx, actor, "Unit", created.id, null, plain(created));
    return { message: `${created.name} added.` };
  });
}

// ------------------------------------------------------------ signatories ---

/** Only one default: setting one clears the others (C7). */
async function clearDefault(tx: Tx, actor: Actor, except: string) {
  const others = await tx.signatory.findMany({
    where: { isDefault: true, id: { not: except } },
  });
  for (const o of others) {
    const after = await tx.signatory.update({
      where: { id: o.id },
      data: { isDefault: false },
    });
    await record(tx, actor, "Signatory", o.id, plain(o), plain(after));
  }
}

export async function saveSignatory(
  db: Db,
  actor: Actor,
  id: string | null,
  raw: Raw,
) {
  assertOrganisation(actor);
  const r = new Reader(raw);
  const name = r.text("name");
  const designation = r.text("designation");
  const isDefault = r.checkbox("isDefault");
  const active = r.checkbox("active");
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  const p = [...r.problems];
  if (!name) p.push("Enter the signatory's name.");
  if (!designation) p.push("Enter the signatory's designation.");
  if (isDefault && !active) p.push("The default signatory must be in use.");
  if (p.length) fail(p);
  return db.$transaction(async (tx) => {
    const clash = await tx.signatory.findFirst({
      where: {
        name: { equals: name!, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) fail([`${clash.name} is already on the signatory list.`]);
    const data = {
      name: name!,
      designation: designation!,
      isDefault,
      active,
      sortOrder,
    };
    if (id) {
      const before = await tx.signatory.findUniqueOrThrow({ where: { id } });
      if (before.isDefault && !isDefault)
        fail([
          `${before.name} is the default signatory. Make someone else the default first.`,
        ]);
      if (isDefault) await clearDefault(tx, actor, id);
      const after = await tx.signatory.update({ where: { id }, data });
      await record(tx, actor, "Signatory", id, plain(before), plain(after));
      return { message: `${after.name} saved.` };
    }
    const created = await tx.signatory.create({
      data: { ...data, isDefault: false },
    });
    if (isDefault) {
      await clearDefault(tx, actor, created.id);
      await tx.signatory.update({
        where: { id: created.id },
        data: { isDefault: true },
      });
    }
    await record(tx, actor, "Signatory", created.id, null, {
      ...plain(created),
      isDefault,
    });
    return { message: `${created.name} added to the signatory list.` };
  });
}

// ------------------------------------------------------- file class codes ---

/** C8: the code in generated references, e.g. RL in OGSERC/RL/002. */
export async function saveFileClassCode(
  db: Db,
  actor: Actor,
  id: string,
  raw: Raw,
) {
  assertOrganisation(actor);
  const code = (raw.code ?? "").trim().toUpperCase() || null;
  if (code && !/^[A-Z0-9]{1,10}$/.test(code))
    fail(["Code: up to 10 capital letters or digits, e.g. RL."]);
  return db.$transaction(async (tx) => {
    const before = await tx.listItem.findFirst({
      where: { id, list: "FILE_CLASS" },
    });
    if (!before) fail(["Unknown file class."]);
    if (code) {
      const clash = await tx.listItem.findFirst({
        where: {
          list: "FILE_CLASS",
          code: { equals: code, mode: "insensitive" },
          id: { not: id },
        },
      });
      if (clash) fail([`${clash.label} already uses the code ${code}.`]);
    }
    const after = await tx.listItem.update({ where: { id }, data: { code } });
    await record(tx, actor, "ListItem", id, plain(before!), plain(after));
    return {
      message: code
        ? `${after.label}: code ${code}.`
        : `${after.label}: no code (references are typed).`,
    };
  });
}
