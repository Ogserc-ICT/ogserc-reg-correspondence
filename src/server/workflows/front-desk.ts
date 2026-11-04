// Front desk intake (SPEC-v2 C3): documents handed in are logged before the
// Registry registers them. No acknowledgement is issued here. The number is
// assigned once, inside the insert transaction (CLAUDE.md rule 2), in the FD
// series of the calendar year of the receipt time (C3.1, V8).
import { dateIn, instantIn } from "@/domain/clock";
import { formatTime } from "@/domain/format";
import {
  deriveIntake,
  intakeAlreadyRegistered,
  intakeLoggedMessage,
  pullIntakeValues,
} from "@/domain/front-desk";
import { intakeNumberYear } from "@/domain/numbering";
import { can, type Principal } from "@/domain/permissions";
import { isPhone, missingFields } from "@/domain/validation";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "../audit";
import type { Db, Tx } from "../db";
import { ForbiddenError, ValidationError } from "../errors";
import { nextNumber } from "../numbers";
import type { Actor } from "../registers";
import { loadRuleContext } from "../rules";
import { Reader, refProblems, throwIfProblems, type Raw } from "./common";

export const INTAKE_LABELS = {
  receivedAt: "Date & time received",
  modeId: "Mode of receipt",
  typeId: "Type (if known)",
  sender: "Sender",
  subject: "Subject",
  deliveredBy: "Delivered by",
  phone: "Phone",
  volumes: "Files / volumes",
  remarks: "Remarks",
} as const;

const NOT_ALLOWED = "You don't have permission to do that.";

/** Front desk officers log; registry staff read the whole log (C12). */
function canSeeIntakes(user: Principal) {
  return can(user, "frontdesk.write") || can(user, "frontdesk.read");
}

/**
 * A front desk officer sees the awaiting-registry list and their own intakes
 * only; registry staff (frontdesk.read) see every intake (C12).
 */
function logWhere(user: Principal): Prisma.FrontDeskIntakeWhereInput {
  if (can(user, "frontdesk.read")) return {};
  if (can(user, "frontdesk.write")) return { receivedById: user.id };
  return { id: { in: [] } };
}

type IntakeFields = {
  receivedAt: Date | null;
  modeId: string | null;
  typeId: string | null;
  sender: string | null;
  subject: string | null;
  deliveredBy: string | null;
  phone: string | null;
  volumes: number | null;
  remarks: string | null;
};

function readIntake(raw: Raw): { f: IntakeFields; problems: string[] } {
  const r = new Reader(raw);
  const L = INTAKE_LABELS;
  const d = r.date("receivedDate", L.receivedAt);
  const t = r.text("receivedTime");
  if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    r.problems.push(`${L.receivedAt}: enter the time as HH:mm.`);
  const f: IntakeFields = {
    receivedAt: d && t && !r.problems.length ? instantIn(d, t) : null,
    modeId: r.id("modeId", L.modeId),
    typeId: r.id("typeId", L.typeId),
    sender: r.text("sender"),
    subject: r.text("subject"),
    deliveredBy: r.text("deliveredBy"),
    phone: r.text("phone"),
    volumes: r.int("volumes", L.volumes),
    remarks: r.text("remarks"),
  };
  if (f.phone && !isPhone(f.phone))
    r.problems.push(`${L.phone}: enter a valid phone number.`);
  return { f, problems: r.problems };
}

/** Front Desk form: today's date and time, Hand delivery (C3.1). */
export async function intakeDefaults(
  db: Db,
  now: Date,
): Promise<Record<string, string>> {
  const hand = await db.listItem.findFirst({
    where: { list: "RECEIPT_MODE", systemKey: "HAND_DELIVERY" },
  });
  return {
    receivedDate: dateIn(now),
    receivedTime: formatTime(now),
    modeId: hand?.id ?? "",
  };
}

/** Front Desk "Save" (C3.2). */
export async function logIntake(db: Db, actor: Actor, raw: Raw) {
  if (!can(actor.user, "frontdesk.write"))
    throw new ForbiddenError(NOT_ALLOWED);
  const { f, problems } = readIntake(raw);
  const L = INTAKE_LABELS;

  return db.$transaction(
    async (tx) => {
      const ctx = await loadRuleContext(tx, actor.now);
      const settings = await tx.registrySettings.findUniqueOrThrow({
        where: { id: 1 },
      });
      const missing = missingFields([
        { label: L.receivedAt, value: f.receivedAt },
        { label: L.modeId, value: f.modeId },
        { label: L.sender, value: f.sender },
        { label: L.subject, value: f.subject },
      ]);
      const all = [...problems];
      all.push(
        ...(await refProblems(
          tx,
          [
            {
              kind: "list",
              list: "RECEIPT_MODE",
              id: f.modeId,
              label: L.modeId,
            },
            { kind: "incomingType", id: f.typeId, label: L.typeId },
          ],
          true,
        )),
      );
      if (f.receivedAt && f.receivedAt.getTime() > actor.now.getTime())
        all.push(`${L.receivedAt}: can't be in the future.`);
      // Q-V2-5: hand deliveries only, when the Commission says so.
      if (f.modeId && !settings.frontDeskAnyMode) {
        const mode = await tx.listItem.findUnique({ where: { id: f.modeId } });
        if (mode && mode.systemKey !== "HAND_DELIVERY")
          all.push(`${L.modeId}: the front desk logs hand deliveries only.`);
      }
      throwIfProblems(missing, all);

      const no = await nextNumber(
        "FD",
        intakeNumberYear(f.receivedAt!, ctx.rules.timezone),
        tx,
      );
      const intake = await tx.frontDeskIntake.create({
        data: {
          intakeNo: no.number,
          intakeYear: no.year,
          serial: no.serial,
          receivedAt: f.receivedAt!,
          modeId: f.modeId!,
          typeId: f.typeId,
          sender: f.sender!,
          subject: f.subject!,
          deliveredBy: f.deliveredBy,
          phone: f.phone,
          volumes: f.volumes,
          remarks: f.remarks,
          receivedById: actor.user.id,
        },
      });
      await audit(
        tx,
        {
          userId: actor.user.id,
          action: "create",
          entityType: "FrontDeskIntake",
          entityId: intake.id,
          after: intake,
        },
        actor.now,
      );
      return { intake, message: intakeLoggedMessage(intake.intakeNo) };
    },
    { timeout: 20_000 },
  );
}

const intakeInclude = {
  mode: { select: { label: true } },
  type: { select: { name: true } },
  receivedBy: { select: { name: true } },
  inwardItem: { select: { id: true, number: true } },
} satisfies Prisma.FrontDeskIntakeInclude;

type IntakeRow = Prisma.FrontDeskIntakeGetPayload<{
  include: typeof intakeInclude;
}>;

async function withDerived(db: Db, rows: IntakeRow[], now: Date) {
  const ctx = await loadRuleContext(db, now);
  return rows.map((r) => ({
    ...r,
    derived: deriveIntake(
      {
        intakeNo: r.intakeNo,
        receivedAt: r.receivedAt,
        inwardItemId: r.inwardItem?.id ?? null,
        registeredAt: r.registeredAt,
      },
      ctx,
    ),
  }));
}

/** The "Awaiting registry" list, oldest first (C3.2). */
export async function awaitingRegistry(db: Db, user: Principal, now: Date) {
  if (!canSeeIntakes(user)) throw new ForbiddenError(NOT_ALLOWED);
  const rows = await db.frontDeskIntake.findMany({
    where: { registeredAt: null },
    include: intakeInclude,
    orderBy: [{ receivedAt: "asc" }, { serial: "asc" }],
  });
  return withDerived(db, rows, now);
}

export type IntakeFilters = {
  q?: string;
  status?: "Awaiting registry" | "Registered";
  from?: string;
  to?: string;
};

export function parseIntakeFilters(
  p: Record<string, string | undefined>,
): IntakeFilters {
  const iso = (v?: string) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  return {
    q: p.q?.trim() || undefined,
    status:
      p.status === "Awaiting registry" || p.status === "Registered"
        ? p.status
        : undefined,
    from: iso(p.from),
    to: iso(p.to),
  };
}

/** Front Desk Log: every intake the user may see, newest first (C3.2). */
export async function intakeLog(
  db: Db,
  user: Principal,
  filters: IntakeFilters,
  now: Date,
) {
  if (!canSeeIntakes(user)) throw new ForbiddenError(NOT_ALLOWED);
  const and: Prisma.FrontDeskIntakeWhereInput[] = [logWhere(user)];
  if (filters.q)
    and.push({
      OR: [
        { intakeNo: { contains: filters.q, mode: "insensitive" } },
        { sender: { contains: filters.q, mode: "insensitive" } },
        { subject: { contains: filters.q, mode: "insensitive" } },
        {
          inwardItem: { number: { contains: filters.q, mode: "insensitive" } },
        },
      ],
    });
  if (filters.status === "Awaiting registry") and.push({ registeredAt: null });
  if (filters.status === "Registered")
    and.push({ registeredAt: { not: null } });
  if (filters.from)
    and.push({ receivedAt: { gte: instantIn(filters.from, "00:00") } });
  if (filters.to)
    and.push({ receivedAt: { lte: instantIn(filters.to, "23:59") } });
  const rows = await db.frontDeskIntake.findMany({
    where: { AND: and },
    include: intakeInclude,
    orderBy: [{ receivedAt: "desc" }, { serial: "desc" }],
    take: 1000,
  });
  return withDerived(db, rows, now);
}

/** Pull into New Inward (C3.2): the form values to fill, non-blank only. */
export async function intakeForPull(db: Db, user: Principal, id: string) {
  if (!can(user, "registers.write") || !can(user, "frontdesk.read"))
    throw new ForbiddenError(NOT_ALLOWED);
  const intake = await db.frontDeskIntake.findUnique({
    where: { id },
    include: { inwardItem: { select: { number: true } } },
  });
  if (!intake) throw new ValidationError(["That intake doesn't exist."]);
  if (intake.inwardItem)
    throw new ValidationError([
      intakeAlreadyRegistered(intake.intakeNo, intake.inwardItem.number),
    ]);
  const pulled = pullIntakeValues({
    receivedAt: intake.receivedAt,
    modeId: intake.modeId,
    typeId: intake.typeId,
    sender: intake.sender,
    subject: intake.subject,
    phone: intake.phone,
    deliveredBy: intake.deliveredBy,
    volumes: intake.volumes,
    remarks: intake.remarks,
  });
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(pulled)) {
    if (k === "receivedAt") {
      values.receivedDate = dateIn(v as Date);
      values.receivedTime = formatTime(v as Date);
    } else values[k] = String(v);
  }
  return { intakeNo: intake.intakeNo, values };
}

/**
 * Locks an intake for registration and refuses one already registered. The
 * unique InwardItem.frontDeskIntakeId is the backstop (E8).
 */
export async function lockIntakeForRegistration(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "FrontDeskIntake" WHERE "id" = ${id}::uuid FOR UPDATE`;
  const intake = await tx.frontDeskIntake.findUnique({
    where: { id },
    include: { inwardItem: { select: { number: true } } },
  });
  if (!intake)
    throw new ValidationError(["Front desk intake: choose one from the list."]);
  if (intake.inwardItem)
    throw new ValidationError([
      intakeAlreadyRegistered(intake.intakeNo, intake.inwardItem.number),
    ]);
  return intake;
}
