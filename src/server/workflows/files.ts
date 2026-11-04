// File Desk workflows: ADD TO FILE INDEX, update, ISSUE FILE, RECORD RETURN
// (SPEC §6, §7). Messages as in TEMPLATES §4.
import {
  fileAlreadyInIndex,
  missingFileClassCode,
  nextFileReference,
} from "@/domain/file-refs";
import { compareDates, type IsoDate } from "@/domain/calendar";
import { dateIn } from "@/domain/clock";
import {
  deriveMovement,
  holderLabel,
  unreturnedMovement,
} from "@/domain/files";
import { formatDate } from "@/domain/format";
import {
  fileDateProblems,
  fileReturnProblems,
  missingFields,
} from "@/domain/validation";
import type { RegistryFile } from "@/generated/prisma/client";
import { fileWhere } from "../access";
import { audit, changedFields } from "../audit";
import { fromDbDate, toDbDate } from "../dates";
import type { Db, Tx } from "../db";
import { assertCan, ValidationError } from "../errors";
import { toMovementFacts } from "../facts";
import type { Actor } from "../registers";
import { loadRuleContext } from "../rules";
import { Reader, refProblems, throwIfProblems, type Raw } from "./common";

/** Issuing a file that is still out needs the officer's confirmation (§6.2). */
export class StillOut extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StillOut";
  }
}

export const FILE_LABELS = {
  reference: "File reference",
  title: "Title",
  fileClassId: "File class",
  owningUnitId: "Owning unit",
  dateOpened: "Date opened",
  currentVolume: "Current volume",
  securityId: "Security",
  fileStatusId: "File status",
  dateClosedOrArchived: "Date closed / archived",
  remarks: "Remarks",
  issuedTo: "Issued to",
  issuedToUserId: "Issued to (staff)",
  unitId: "Unit",
  volume: "Volume",
  purpose: "Purpose",
  returnByOverride: "Return by (override)",
  dateReturned: "Date returned",
  receivedBackById: "Received back by",
} as const;

const L = FILE_LABELS;

/** "ogserc/rl/002 " → "OGSERC/RL/002". */
export function normaliseReference(ref: string): string {
  return ref.trim().replace(/\s+/g, "").toUpperCase();
}

async function lockFile(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "RegistryFile" WHERE "id" = ${id}::uuid FOR UPDATE`;
}

async function loadFile(
  tx: Tx,
  actor: Actor,
  id: string,
): Promise<RegistryFile> {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ValidationError(["That file doesn't exist."]);
  await lockFile(tx, id);
  const file = await tx.registryFile.findFirst({
    where: { AND: [{ id }, fileWhere(actor.user)] },
  });
  if (!file) throw new ValidationError(["That file doesn't exist."]);
  return file;
}

type FileFields = {
  title: string | null;
  fileClassId: string | null;
  owningUnitId: string | null;
  dateOpened: IsoDate | null;
  currentVolume: number | null;
  securityId: string | null;
  fileStatusId: string | null;
  dateClosedOrArchived: IsoDate | null;
  remarks: string | null;
};

function readFile(raw: Raw): { f: Partial<FileFields>; problems: string[] } {
  const r = new Reader(raw);
  const f: Partial<FileFields> = {};
  if (r.has("title")) f.title = r.text("title");
  if (r.has("remarks")) f.remarks = r.text("remarks");
  for (const k of [
    "fileClassId",
    "owningUnitId",
    "securityId",
    "fileStatusId",
  ] as const)
    if (r.has(k)) f[k] = r.id(k, L[k]);
  for (const k of ["dateOpened", "dateClosedOrArchived"] as const)
    if (r.has(k)) f[k] = r.date(k, L[k]);
  if (r.has("currentVolume")) {
    f.currentVolume = r.int("currentVolume", L.currentVolume);
    if (f.currentVolume === 0)
      r.problems.push(`${L.currentVolume}: volumes start at 1.`);
  }
  return { f, problems: r.problems };
}

async function checkFile(
  tx: Tx,
  f: FileFields,
  problems: string[],
  today: IsoDate,
  create: boolean,
) {
  const missing = missingFields([
    { label: L.title, value: f.title },
    { label: L.dateOpened, value: f.dateOpened },
    { label: L.securityId, value: f.securityId },
    { label: L.fileStatusId, value: f.fileStatusId },
  ]);
  const all = [...problems];
  all.push(
    ...(await refProblems(
      tx,
      [
        {
          kind: "list",
          list: "FILE_CLASS",
          id: f.fileClassId,
          label: L.fileClassId,
        },
        { kind: "unit", id: f.owningUnitId, label: L.owningUnitId },
        {
          kind: "list",
          list: "FILE_SECURITY",
          id: f.securityId,
          label: L.securityId,
        },
        {
          kind: "list",
          list: "FILE_STATUS",
          id: f.fileStatusId,
          label: L.fileStatusId,
        },
      ],
      create,
    )),
  );
  if (f.dateOpened)
    all.push(
      ...fileDateProblems(
        {
          dateOpened: f.dateOpened,
          dateClosedOrArchived: f.dateClosedOrArchived,
        },
        today,
      ),
    );
  if (f.fileStatusId) {
    const status = await tx.listItem.findUnique({
      where: { id: f.fileStatusId },
    });
    if (status?.systemKey !== "OPEN" && !f.dateClosedOrArchived)
      all.push(
        `${L.dateClosedOrArchived}: required when the file is ${status?.label.toLowerCase()}.`,
      );
  }
  throwIfProblems(missing, all);
}

/**
 * Next reference for a file class code, under a per-code lock held until the
 * transaction ends, so two new files never get the same serial (C8).
 */
async function generateReference(tx: Tx, code: string): Promise<string> {
  const settings = await tx.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`file-ref:${code}`}))`;
  const stem = `${settings.filePrefix}/${code}/`;
  const existing = await tx.registryFile.findMany({
    where: { reference: { startsWith: stem, mode: "insensitive" } },
    select: { reference: true },
  });
  return nextFileReference(
    settings.filePrefix,
    code,
    existing.map((f) => f.reference),
    settings.fileRefSerialDigits,
  );
}

/** The reference a new file of this class would get (New file preview). */
export async function previewFileReference(
  db: Db,
  fileClassId: string,
): Promise<{ reference: string } | { problem: string }> {
  const cls = await db.listItem.findFirst({
    where: { id: fileClassId, list: "FILE_CLASS" },
  });
  if (!cls) return { problem: "" };
  if (!cls.code?.trim()) return { problem: missingFileClassCode(cls.label) };
  return db.$transaction(async (tx) => ({
    reference: await generateReference(tx, cls.code!.trim().toUpperCase()),
  }));
}

/** ADD TO FILE INDEX. */
export async function createFile(db: Db, actor: Actor, raw: Raw) {
  assertCan(actor.user, "files.write");
  const typed = normaliseReference(raw.reference ?? "");
  const { f, problems } = readFile(raw);
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const defaultKey = async (list: "FILE_SECURITY" | "FILE_STATUS") =>
      (await tx.listItem.findFirst({ where: { list, systemKey: "OPEN" } }))
        ?.id ?? null;
    const fields: FileFields = {
      title: f.title ?? null,
      fileClassId: f.fileClassId ?? null,
      owningUnitId: f.owningUnitId ?? null,
      dateOpened: f.dateOpened ?? ctx.today,
      currentVolume: f.currentVolume ?? 1,
      securityId: f.securityId ?? (await defaultKey("FILE_SECURITY")),
      fileStatusId: f.fileStatusId ?? (await defaultKey("FILE_STATUS")),
      dateClosedOrArchived: f.dateClosedOrArchived ?? null,
      remarks: f.remarks ?? null,
    };
    await checkFile(tx, fields, problems, ctx.today, true);
    // SPEC-v2 C8: blank → generated from the file class; typed → unique
    // ignoring case (a unique index backs this up).
    let reference = typed;
    if (!reference) {
      const cls = fields.fileClassId
        ? await tx.listItem.findUnique({ where: { id: fields.fileClassId } })
        : null;
      if (!cls) throwIfProblems([L.reference], []);
      if (!cls!.code?.trim())
        throw new ValidationError([missingFileClassCode(cls!.label)]);
      reference = await generateReference(tx, cls!.code!.trim().toUpperCase());
    } else if (
      await tx.registryFile.findFirst({
        where: { reference: { equals: reference, mode: "insensitive" } },
      })
    )
      throw new ValidationError([fileAlreadyInIndex(reference)]);
    const file = await tx.registryFile.create({
      data: {
        reference: reference,
        ...fields,
        title: fields.title!,
        securityId: fields.securityId!,
        fileStatusId: fields.fileStatusId!,
        dateOpened: toDbDate(fields.dateOpened!),
        dateClosedOrArchived: toDbDate(fields.dateClosedOrArchived),
        currentVolume: fields.currentVolume!,
        createdById: actor.user.id,
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "create",
        entityType: "RegistryFile",
        entityId: file.id,
        after: file,
      },
      actor.now,
    );
    return { file, message: `${reference} added to the File Index.` };
  });
}

/** Update the File Index entry. The reference never changes. */
export async function updateFile(db: Db, actor: Actor, id: string, raw: Raw) {
  assertCan(actor.user, "files.write");
  const { f, problems } = readFile(raw);
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const row = await loadFile(tx, actor, id);
    const before: FileFields = {
      title: row.title,
      fileClassId: row.fileClassId,
      owningUnitId: row.owningUnitId,
      dateOpened: fromDbDate(row.dateOpened),
      currentVolume: row.currentVolume,
      securityId: row.securityId,
      fileStatusId: row.fileStatusId,
      dateClosedOrArchived: fromDbDate(row.dateClosedOrArchived),
      remarks: row.remarks,
    };
    const after = { ...before, ...f };
    const diff = changedFields(before, after);
    if (!Object.keys(diff.after).length)
      return { file: row, message: "Nothing changed." };
    await checkFile(tx, after, problems, ctx.today, false);
    const file = await tx.registryFile.update({
      where: { id },
      data: {
        ...after,
        title: after.title!,
        securityId: after.securityId!,
        fileStatusId: after.fileStatusId!,
        currentVolume: after.currentVolume ?? 1,
        dateOpened: toDbDate(after.dateOpened!),
        dateClosedOrArchived: toDbDate(after.dateClosedOrArchived),
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "update",
        entityType: "RegistryFile",
        entityId: id,
        ...diff,
      },
      actor.now,
    );
    return { file, message: `${row.reference} updated.` };
  });
}

/**
 * ISSUE FILE. outAt is now. If the file is still out, the officer must
 * confirm (`confirmStillOut`); the new movement is then flagged.
 */
export async function issueFile(
  db: Db,
  actor: Actor,
  fileId: string,
  raw: Raw,
  opts: { confirmStillOut?: boolean } = {},
) {
  assertCan(actor.user, "files.write");
  const r = new Reader(raw);
  const issuedToUserId = r.id("issuedToUserId", L.issuedToUserId);
  let issuedTo = r.text("issuedTo");
  const unitId = r.id("unitId", L.unitId);
  const volume = r.int("volume", L.volume);
  const purpose = r.text("purpose");
  const returnByOverride = r.date("returnByOverride", L.returnByOverride);

  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const file = await loadFile(tx, actor, fileId);
    if (!issuedTo && issuedToUserId)
      issuedTo =
        (await tx.user.findUnique({ where: { id: issuedToUserId } }))?.name ??
        null;
    // Internal File Desk (C8): issued to an OGSERC unit from the list.
    const missing = missingFields([
      { label: L.issuedTo, value: issuedTo },
      { label: L.unitId, value: unitId },
    ]);
    const problems = [...r.problems];
    problems.push(
      ...(await refProblems(
        tx,
        [{ kind: "unit", id: unitId, label: L.unitId }],
        true,
      )),
    );
    if (
      issuedToUserId &&
      !(await tx.user.count({ where: { id: issuedToUserId, active: true } }))
    )
      problems.push(`${L.issuedToUserId}: choose a value from the list.`);
    if (returnByOverride && compareDates(returnByOverride, ctx.today) < 0)
      problems.push(`${L.returnByOverride} can't be before today.`);
    throwIfProblems(missing, problems);

    const movements = await tx.fileMovement.findMany({
      where: { fileId: file.id },
      include: { unit: { select: { name: true } } },
    });
    const out = unreturnedMovement(movements.map(toMovementFacts));
    if (out && !opts.confirmStillOut)
      throw new StillOut(
        `${file.reference} is still out with ${holderLabel(out)}. Issue it anyway?`,
      );

    const m = await tx.fileMovement.create({
      data: {
        fileId: file.id,
        outAt: actor.now,
        volume: volume ?? file.currentVolume,
        releasedById: actor.user.id,
        issuedTo: issuedTo!,
        issuedToUserId,
        unitId,
        purpose,
        returnByOverride: toDbDate(returnByOverride),
        issuedWhileOut: out !== null,
      },
      include: { unit: { select: { name: true } } },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "issue",
        entityType: "RegistryFile",
        entityId: file.id,
        after: {
          issuedTo,
          unit: m.unit?.name ?? null,
          outAt: m.outAt,
          issuedWhileOut: m.issuedWhileOut,
        },
        note: out
          ? `Issued while still out with ${holderLabel(out)}`
          : undefined,
      },
      actor.now,
    );
    const due = deriveMovement(toMovementFacts(m), ctx).returnDue;
    return {
      movement: m,
      message: `${file.reference} issued to ${issuedTo}. Return due ${formatDate(due)}.`,
    };
  });
}

/** RECORD RETURN: the latest unreturned movement comes back (today by default). */
export async function recordReturn(
  db: Db,
  actor: Actor,
  fileId: string,
  raw: Raw = {},
) {
  assertCan(actor.user, "files.write");
  const r = new Reader(raw);
  const asked = r.date("dateReturned", L.dateReturned);
  const receivedBackById =
    r.id("receivedBackById", L.receivedBackById) ?? actor.user.id;
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const file = await loadFile(tx, actor, fileId);
    const movements = await tx.fileMovement.findMany({
      where: { fileId: file.id },
      include: { unit: { select: { name: true } } },
    });
    const facts = unreturnedMovement(movements.map(toMovementFacts));
    if (!facts)
      throw new ValidationError([
        `${file.reference} is not recorded as out. Nothing to return.`,
      ]);
    const dateReturned = asked ?? ctx.today;
    const problems = [
      ...r.problems,
      ...fileReturnProblems(
        { outDate: dateIn(facts.outAt, ctx.rules.timezone), dateReturned },
        ctx.today,
      ),
      ...(await refProblems(
        tx,
        [
          {
            kind: "registryUser",
            id: receivedBackById,
            label: L.receivedBackById,
          },
        ],
        true,
      )),
    ];
    throwIfProblems([], problems);
    await tx.fileMovement.update({
      where: { id: facts.id },
      data: { dateReturned: toDbDate(dateReturned), receivedBackById },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "return",
        entityType: "RegistryFile",
        entityId: file.id,
        before: { holder: holderLabel(facts), dateReturned: null },
        after: { holder: holderLabel(facts), dateReturned },
      },
      actor.now,
    );
    return {
      message: `${file.reference} returned to the Registry from ${holderLabel(facts)}.`,
    };
  });
}
