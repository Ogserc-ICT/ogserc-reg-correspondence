// Inward workflows: New Inward, Update Item, Forwarded today, Close today
// (SPEC §4.1, §7). Validation lists every problem at once (STACK rule 17).
import { type IsoDate } from "@/domain/calendar";
import { dateIn, instantIn } from "@/domain/clock";
import { parseNairaToKobo } from "@/domain/format";
import { deemedReceiptDate } from "@/domain/receipt";
import {
  EMAIL,
  inwardDateProblems,
  isPhone,
  missingFields,
} from "@/domain/validation";
import {
  intakeAlreadyRegistered,
  receiptChangedFromIntake,
} from "@/domain/front-desk";
import { savedInwardMessage } from "@/domain/inward";
import {
  forwardBeforeRoutingPrompt,
  needsForwardBeforeRoutingConfirm,
} from "@/domain/routing";
import { can } from "@/domain/permissions";
import { Prisma, type InwardItem } from "@/generated/prisma/client";
import { inwardWhere } from "../access";
import { audit, changedFields } from "../audit";
import { fromDbDate, toDbDate } from "../dates";
import type { Db, Tx } from "../db";
import { assertCan, ForbiddenError, ValidationError } from "../errors";
import {
  createInward,
  refreshInward,
  refreshOutward,
  refreshSameCac,
  type Actor,
} from "../registers";
import { loadRuleContext } from "../rules";
import {
  linkProblems,
  lockInward,
  Reader,
  refProblems,
  throwIfProblems,
  type Raw,
} from "./common";
import { lockIntakeForRegistration } from "./front-desk";

export type InwardFields = {
  receivedAt: Date | null;
  modeId: string | null;
  typeId: string | null;
  sender: string | null;
  senderCategoryId: string | null;
  subject: string | null;
  senderRef: string | null;
  documentDate: IsoDate | null;
  relatedOgsercNo: string | null;
  inResponseToOutwardId: string | null;
  cacNo: string | null;
  principalLgaId: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  deliveredBy: string | null;
  volumes: number | null;
  schedule2DocsAttached: number | null;
  feeEvidenceAttached: boolean | null;
  paymentRef: string | null;
  amountShownKobo: bigint | null;
  receivedById: string | null;
  fileId: string | null;
  unitOverrideId: string | null;
  ackIssuedViaId: string | null;
  actionRequiredId: string | null;
  priorityId: string | null;
  actionOfficer: string | null;
  responseDueOverride: IsoDate | null;
  remarks: string | null;
  multiState: boolean | null;
  registrationDeadlineOverride: IsoDate | null;
  dateForwarded: IsoDate | null;
  receivedByUnitOfficer: string | null;
  dateClosedManual: IsoDate | null;
  closingNote: string | null;
};

type Key = keyof InwardFields;

/** Labels as on the form; also used in "Please complete:". */
export const INWARD_LABELS: Record<Key, string> = {
  receivedAt: "Date & time received",
  modeId: "Mode of receipt",
  typeId: "Type of correspondence",
  sender: "Sender",
  senderCategoryId: "Sender category",
  subject: "Subject",
  senderRef: "Sender's ref. no.",
  documentDate: "Date of the letter",
  relatedOgsercNo: "Related OGSERC No.",
  inResponseToOutwardId: "In response to our ref.",
  cacNo: "CAC No.",
  principalLgaId: "Principal LGA",
  contactPerson: "Contact person",
  phone: "Phone",
  email: "Email",
  deliveredBy: "Delivered / sent by",
  volumes: "Files / volumes",
  schedule2DocsAttached: "Schedule 2 documents attached",
  feeEvidenceAttached: "Fee evidence attached",
  paymentRef: "Payment reference",
  amountShownKobo: "Amount shown (₦)",
  receivedById: "Received by",
  fileId: "File",
  unitOverrideId: "Forward to (override)",
  ackIssuedViaId: "Acknowledgement issued via",
  actionRequiredId: "Action required",
  priorityId: "Priority",
  actionOfficer: "Action officer",
  responseDueOverride: "Response due (override)",
  remarks: "Remarks",
  multiState: "Multi-State licensee",
  registrationDeadlineOverride: "Registration deadline (para 25 extension)",
  dateForwarded: "Date forwarded",
  receivedByUnitOfficer: "Received in unit by",
  dateClosedManual: "Date closed",
  closingNote: "Closing note",
};

const REQUIRED: Key[] = [
  "receivedAt",
  "modeId",
  "typeId",
  "sender",
  "senderCategoryId",
  "subject",
  "receivedById",
  "ackIssuedViaId",
  // Action required is set on the Routing Desk (SPEC-v2 C4).
];

/**
 * Fields set later by the Registry: Update Item, reduced by SPEC-v2 C5.4.
 * The unit, file, action, priority, action officer and due override are set
 * only on the Routing Desk.
 */
export const INWARD_HANDLING_KEYS: Key[] = [
  "dateForwarded",
  "receivedByUnitOfficer",
  "ackIssuedViaId",
  "dateClosedManual",
  "closingNote",
  "remarks",
];

const CREATE_KEYS = (Object.keys(INWARD_LABELS) as Key[]).filter(
  (k) =>
    ![
      "dateForwarded",
      "receivedByUnitOfficer",
      "dateClosedManual",
      "closingNote",
    ].includes(k),
);
const ALL_KEYS = Object.keys(INWARD_LABELS) as Key[];

const DATE_KEYS = new Set<Key>([
  "documentDate",
  "responseDueOverride",
  "registrationDeadlineOverride",
  "dateForwarded",
  "dateClosedManual",
]);

/** Raw form → typed fields. Only keys present in the form are returned. */
export function readInward(raw: Raw): {
  fields: Partial<InwardFields>;
  problems: string[];
} {
  const r = new Reader(raw);
  const f: Partial<InwardFields> = {};
  const L = INWARD_LABELS;

  if (r.has("receivedDate") || r.has("receivedTime")) {
    const d = r.date("receivedDate", L.receivedAt);
    const t = r.text("receivedTime");
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      r.problems.push(`${L.receivedAt}: enter the time as HH:mm.`);
    f.receivedAt = d && t && !r.problems.length ? instantIn(d, t) : null;
  }
  const texts: Key[] = [
    "sender",
    "subject",
    "senderRef",
    "relatedOgsercNo",
    "cacNo",
    "contactPerson",
    "phone",
    "email",
    "deliveredBy",
    "paymentRef",
    "actionOfficer",
    "remarks",
    "receivedByUnitOfficer",
    "closingNote",
  ];
  for (const k of texts)
    if (r.has(k)) (f as Record<string, unknown>)[k] = r.text(k);
  const ids: Key[] = [
    "modeId",
    "typeId",
    "senderCategoryId",
    "inResponseToOutwardId",
    "principalLgaId",
    "receivedById",
    "fileId",
    "unitOverrideId",
    "ackIssuedViaId",
    "actionRequiredId",
    "priorityId",
  ];
  for (const k of ids)
    if (r.has(k)) (f as Record<string, unknown>)[k] = r.id(k, L[k]);
  for (const k of DATE_KEYS)
    if (r.has(k)) (f as Record<string, unknown>)[k] = r.date(k, L[k]);
  for (const k of ["volumes", "schedule2DocsAttached"] as const)
    if (r.has(k)) f[k] = r.int(k, L[k]);
  if (r.has("feeEvidenceAttached"))
    f.feeEvidenceAttached = r.yesNo("feeEvidenceAttached");
  if (r.has("multiStateShown")) f.multiState = r.checkbox("multiState") || null;
  if (r.has("amountShown")) {
    const kobo = parseNairaToKobo(raw.amountShown ?? "");
    if (kobo === "invalid")
      r.problems.push(`${L.amountShownKobo}: enter an amount such as 250,000.`);
    f.amountShownKobo = kobo === "invalid" ? null : kobo;
  }
  if (f.email && !EMAIL.test(f.email))
    r.problems.push(`${L.email}: enter a valid email address.`);
  if (f.phone && !isPhone(f.phone))
    r.problems.push(`${L.phone}: enter a valid phone number.`);
  return { fields: f, problems: r.problems };
}

function fromRow(row: InwardItem): InwardFields {
  return {
    receivedAt: row.receivedAt,
    modeId: row.modeId,
    typeId: row.typeId,
    sender: row.sender,
    senderCategoryId: row.senderCategoryId,
    subject: row.subject,
    senderRef: row.senderRef,
    documentDate: fromDbDate(row.documentDate),
    relatedOgsercNo: row.relatedOgsercNo,
    inResponseToOutwardId: row.inResponseToOutwardId,
    cacNo: row.cacNo,
    principalLgaId: row.principalLgaId,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    deliveredBy: row.deliveredBy,
    volumes: row.volumes,
    schedule2DocsAttached: row.schedule2DocsAttached,
    feeEvidenceAttached: row.feeEvidenceAttached,
    paymentRef: row.paymentRef,
    amountShownKobo: row.amountShownKobo,
    receivedById: row.receivedById,
    fileId: row.fileId,
    unitOverrideId: row.unitOverrideId,
    ackIssuedViaId: row.ackIssuedViaId,
    actionRequiredId: row.actionRequiredId,
    priorityId: row.priorityId,
    actionOfficer: row.actionOfficer,
    responseDueOverride: fromDbDate(row.responseDueOverride),
    remarks: row.remarks,
    multiState: row.multiState,
    registrationDeadlineOverride: fromDbDate(row.registrationDeadlineOverride),
    dateForwarded: fromDbDate(row.dateForwarded),
    receivedByUnitOfficer: row.receivedByUnitOfficer,
    dateClosedManual: fromDbDate(row.dateClosedManual),
    closingNote: row.closingNote,
  };
}

function toData(patch: Partial<InwardFields>) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch))
    data[k] = DATE_KEYS.has(k as Key) ? toDbDate(v as IsoDate | null) : v;
  return data;
}

/** Every rule a complete set of fields must satisfy. */
async function checkAll(
  tx: Tx,
  actor: Actor,
  f: InwardFields,
  problems: string[],
  opts: { create: boolean; changed: Set<Key> },
  today: IsoDate,
) {
  const missing = missingFields(
    REQUIRED.map((k) => ({ label: INWARD_LABELS[k], value: f[k] })),
  );
  if (
    f.dateClosedManual &&
    !f.closingNote &&
    opts.changed.has("dateClosedManual")
  )
    missing.push(INWARD_LABELS.closingNote);
  const all = [...problems];
  const changed = (k: Key) => opts.create || opts.changed.has(k);
  all.push(
    ...(await refProblems(
      tx,
      [
        {
          kind: "list",
          list: "RECEIPT_MODE",
          id: changed("modeId") ? f.modeId : null,
          label: INWARD_LABELS.modeId,
        },
        {
          kind: "incomingType",
          id: changed("typeId") ? f.typeId : null,
          label: INWARD_LABELS.typeId,
        },
        {
          kind: "list",
          list: "PARTY_CATEGORY",
          id: changed("senderCategoryId") ? f.senderCategoryId : null,
          label: INWARD_LABELS.senderCategoryId,
        },
        {
          kind: "list",
          list: "LGA",
          id: changed("principalLgaId") ? f.principalLgaId : null,
          label: INWARD_LABELS.principalLgaId,
        },
        {
          kind: "registryUser",
          id: changed("receivedById") ? f.receivedById : null,
          label: INWARD_LABELS.receivedById,
        },
        {
          kind: "unit",
          id: changed("unitOverrideId") ? f.unitOverrideId : null,
          label: INWARD_LABELS.unitOverrideId,
        },
        {
          kind: "list",
          list: "ACK_VIA",
          id: changed("ackIssuedViaId") ? f.ackIssuedViaId : null,
          label: INWARD_LABELS.ackIssuedViaId,
        },
        {
          kind: "list",
          list: "ACTION_REQUIRED",
          id: changed("actionRequiredId") ? f.actionRequiredId : null,
          label: INWARD_LABELS.actionRequiredId,
        },
        {
          kind: "list",
          list: "PRIORITY",
          id: changed("priorityId") ? f.priorityId : null,
          label: INWARD_LABELS.priorityId,
        },
      ],
      opts.create,
    )),
    ...(await linkProblems(tx, actor.user, {
      outwardId: changed("inResponseToOutwardId")
        ? f.inResponseToOutwardId
        : null,
      fileId: changed("fileId") ? f.fileId : null,
    })),
  );
  if (f.receivedAt)
    all.push(
      ...inwardDateProblems(
        {
          receiptDate: dateIn(f.receivedAt),
          receivedAtInFuture: f.receivedAt.getTime() > actor.now.getTime(),
          documentDate: f.documentDate,
          dateForwarded: f.dateForwarded,
          dateClosedManual: f.dateClosedManual,
        },
        today,
      ),
    );
  throwIfProblems(missing, all);
}

/** Set only on the Routing Desk (SPEC-v2 C4, C5.2); never on New Inward. */
const ROUTING_KEYS = [
  "fileId",
  "unitOverrideId",
  "actionRequiredId",
  "priorityId",
  "actionOfficer",
  "responseDueOverride",
] as const satisfies readonly Key[];

export const RECEIPT_CHANGE_REASON =
  "Reason for changing the front desk receipt time or mode";

/**
 * SAVE TO REGISTER (SPEC-v2 C4). With a front desk intake chosen, the item is
 * created, linked and the intake marked registered in one transaction (C3.2);
 * a receipt time or mode that differs from the intake needs a reason and is
 * audited (E7). Returns the item and the C4 message.
 */
export async function logInward(db: Db, actor: Actor, raw: Raw) {
  assertCan(actor.user, "registers.write");
  const { fields, problems } = readInward(raw);
  const f = Object.fromEntries(
    CREATE_KEYS.map((k) => [k, fields[k] ?? null]),
  ) as InwardFields;
  for (const k of [
    "dateForwarded",
    "receivedByUnitOfficer",
    "dateClosedManual",
    "closingNote",
    ...ROUTING_KEYS,
  ] as const)
    f[k] = null;
  const intakeId = new Reader(raw).id("frontDeskIntakeId", "Front desk intake");
  if (raw.frontDeskIntakeId?.trim() && !intakeId)
    problems.push("Front desk intake: choose one from the list.");
  const reason = raw.receiptChangeReason?.trim() || null;
  if (intakeId && !can(actor.user, "frontdesk.read"))
    throw new ForbiddenError("You don't have permission to do that.");

  try {
    return await db.$transaction(
      async (tx) => {
        const ctx = await loadRuleContext(tx, actor.now);
        const intake = intakeId
          ? await lockIntakeForRegistration(tx, intakeId)
          : null;
        const changed =
          intake && f.receivedAt
            ? receiptChangedFromIntake(intake, {
                receivedAt: f.receivedAt,
                modeId: f.modeId,
              })
            : [];
        const all = [...problems];
        if (changed.length && !reason)
          all.push(
            `${RECEIPT_CHANGE_REASON}: the ${changed
              .map((k) => (k === "receivedAt" ? "receipt time" : "mode"))
              .join(
                " and ",
              )} differ${changed.length > 1 ? "" : "s"} from ${intake!.intakeNo}, so give a reason.`,
          );
        await checkAll(
          tx,
          actor,
          f,
          all,
          { create: true, changed: new Set() },
          ctx.today,
        );
        const item = await createInward(
          tx,
          {
            ...f,
            receivedAt: f.receivedAt!,
            modeId: f.modeId!,
            typeId: f.typeId!,
            sender: f.sender!,
            senderCategoryId: f.senderCategoryId!,
            subject: f.subject!,
            receivedById: f.receivedById!,
            ackIssuedViaId: f.ackIssuedViaId!,
            frontDeskIntakeId: intake?.id ?? null,
          },
          actor,
        );
        if (intake) {
          await tx.frontDeskIntake.update({
            where: { id: intake.id },
            data: { registeredAt: actor.now },
          });
          await audit(
            tx,
            {
              userId: actor.user.id,
              action: "register",
              entityType: "FrontDeskIntake",
              entityId: intake.id,
              before: { registeredAt: null, inwardItem: null },
              after: { registeredAt: actor.now, inwardItem: item.number },
            },
            actor.now,
          );
          if (changed.length) {
            const pick = (o: { receivedAt: Date; modeId: string | null }) =>
              Object.fromEntries(changed.map((k) => [k, o[k]]));
            await audit(
              tx,
              {
                userId: actor.user.id,
                action: "receipt-changed-from-intake",
                entityType: "InwardItem",
                entityId: item.id,
                before: { intakeNo: intake.intakeNo, ...pick(intake) },
                after: pick({ receivedAt: f.receivedAt!, modeId: f.modeId }),
                note: reason!,
              },
              actor.now,
            );
          }
        }
        const unit = await tx.unit.findUniqueOrThrow({
          where: { id: item.routedUnitId },
        });
        return {
          item,
          // The email line (C6) is added in V6; Off mode has none.
          message: savedInwardMessage(item.number, unit.name),
        };
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    // A second registration of one intake that slipped past the lock (E8).
    if (
      intakeId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const intake = await db.frontDeskIntake.findUnique({
        where: { id: intakeId },
        include: { inwardItem: { select: { number: true } } },
      });
      if (intake?.inwardItem)
        throw new ValidationError([
          intakeAlreadyRegistered(intake.intakeNo, intake.inwardItem.number),
        ]);
    }
    throw err;
  }
}

async function loadForWrite(tx: Tx, actor: Actor, id: string) {
  await lockInward(tx, id);
  const row = await tx.inwardItem.findFirst({
    where: { AND: [{ id }, inwardWhere(actor.user)] },
  });
  if (!row) throw new ValidationError(["That inward item doesn't exist."]);
  if (row.voidedAt)
    throw new ValidationError([`${row.number} is void and can't be changed.`]);
  return row;
}

/**
 * Update Item. Registry officers change the handling fields only; the Head of
 * Registry may change any field (`full`), with a reason. The number never
 * changes; a new receipt time or mode recomputes the deemed date, and a new
 * type re-snapshots its rules.
 */
export async function updateInward(
  db: Db,
  actor: Actor,
  id: string,
  raw: Raw,
  opts: {
    full?: boolean;
    reason?: string;
    confirmForwardBeforeRouting?: boolean;
  } = {},
) {
  assertCan(actor.user, "registers.write");
  if (opts.full) assertCan(actor.user, "items.editAny");
  const reason = opts.reason?.trim();
  if (opts.full && !reason)
    throw new ValidationError([
      "Give a reason for changing the registered details.",
    ]);
  const { fields, problems } = readInward(raw);
  // Not even the Head of Registry's full edit changes the routing (C5.4).
  const allowed = opts.full
    ? ALL_KEYS.filter((k) => !(ROUTING_KEYS as readonly Key[]).includes(k))
    : INWARD_HANDLING_KEYS;

  return db.$transaction(
    async (tx) => {
      const ctx = await loadRuleContext(tx, actor.now);
      const row = await loadForWrite(tx, actor, id);
      const before = fromRow(row);
      const patch: Partial<InwardFields> = {};
      for (const k of allowed)
        if (k in fields) (patch as Record<string, unknown>)[k] = fields[k];
      const after = { ...before, ...patch };
      const diff = changedFields(before, after);
      const changed = new Set(Object.keys(diff.after) as Key[]);
      if (!changed.size) return { item: row, message: "Nothing changed." };

      await checkAll(
        tx,
        actor,
        after,
        problems,
        { create: false, changed },
        ctx.today,
      );

      const data = toData(
        Object.fromEntries([...changed].map((k) => [k, after[k]])),
      );
      if (
        changed.has("dateForwarded") &&
        forwardingBeforeRouting(
          row,
          after.dateForwarded,
          opts.confirmForwardBeforeRouting,
        )
      ) {
        data.forwardedBeforeRouting = true;
        diff.before.forwardedBeforeRouting = false;
        diff.after.forwardedBeforeRouting = true;
      }
      if (changed.has("receivedAt") || changed.has("modeId")) {
        data.deemedReceiptDate = toDbDate(
          deemedReceiptDate(
            after.receivedAt!,
            after.modeId!,
            ctx.rules,
            ctx.holidays,
          ),
        );
        data.snapClosingTime = ctx.rules.officeClosingTime;
      }
      if (changed.has("typeId")) {
        const t = await tx.incomingType.findUniqueOrThrow({
          where: { id: after.typeId! },
        });
        Object.assign(data, {
          snapTypeName: t.name,
          snapCategory: t.category,
          snapOrderRef: t.orderRef,
          snapDefaultUnitId: t.defaultUnitId,
          snapResponseTargetDays: t.responseTargetDays,
          snapPara103SlipWording: t.para103SlipWording,
          snapSlipFooter: t.slipFooter,
          snapIsRegistration: t.isRegistration,
          snapRequiresRelatedOgsercNo: t.requiresRelatedOgsercNo,
        });
      }
      const item = await tx.inwardItem.update({ where: { id }, data });
      await audit(
        tx,
        {
          userId: actor.user.id,
          action: opts.full ? "edit" : "update",
          entityType: "InwardItem",
          entityId: id,
          ...diff,
          note: reason,
        },
        actor.now,
      );
      await refreshInward(tx, id, ctx);
      for (const outId of new Set([
        before.inResponseToOutwardId,
        after.inResponseToOutwardId,
      ]))
        if (outId && changed.has("inResponseToOutwardId"))
          await refreshOutward(tx, outId, ctx);
      if (changed.has("cacNo") || changed.has("typeId"))
        for (const cac of new Set([before.cacNo, after.cacNo]))
          if (cac) await refreshSameCac(tx, cac, ctx);
      return { item, message: `${item.number} updated.` };
    },
    { timeout: 20_000 },
  );
}

/** The question the form asks before going ahead (C5.4). */
export class NotRoutedYet extends Error {
  constructor(prompt: string) {
    super(prompt);
    this.name = "NotRoutedYet";
  }
}

/**
 * Forwarding an item the Secretary / Head of Admin has not routed yet needs
 * the officer's confirmation (SPEC-v2 C5.4, E6). Returns true when the
 * "Forwarded before routing" fact must be set; throws NotRoutedYet when the
 * officer has not confirmed.
 */
function forwardingBeforeRouting(
  row: InwardItem,
  settingForwarded: IsoDate | null,
  confirmed: boolean | undefined,
): boolean {
  const needed = needsForwardBeforeRoutingConfirm({
    routed: row.routedAt !== null,
    dateForwarded: fromDbDate(row.dateForwarded),
    settingForwarded,
  });
  if (needed && !confirmed)
    throw new NotRoutedYet(forwardBeforeRoutingPrompt(row.number));
  return needed;
}

/** FORWARDED TODAY: dateForwarded = today, if empty. */
export async function forwardToday(
  db: Db,
  actor: Actor,
  id: string,
  opts: { confirmForwardBeforeRouting?: boolean } = {},
) {
  assertCan(actor.user, "registers.write");
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const row = await loadForWrite(tx, actor, id);
    if (row.dateForwarded)
      return { item: row, message: `${row.number} was already forwarded.` };
    const early = forwardingBeforeRouting(
      row,
      ctx.today,
      opts.confirmForwardBeforeRouting,
    );
    const item = await tx.inwardItem.update({
      where: { id },
      data: {
        dateForwarded: toDbDate(ctx.today),
        ...(early && { forwardedBeforeRouting: true }),
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "forward",
        entityType: "InwardItem",
        entityId: id,
        before: {
          dateForwarded: null,
          ...(early && { forwardedBeforeRouting: false }),
        },
        after: {
          dateForwarded: ctx.today,
          ...(early && { forwardedBeforeRouting: true }),
        },
      },
      actor.now,
    );
    await refreshInward(tx, id, ctx);
    return { item, message: `${row.number} forwarded today.` };
  });
}

/**
 * CLOSE TODAY, without an outgoing letter. A closing note is required (new);
 * an item not yet forwarded is marked forwarded today as well (VBA).
 */
export async function closeToday(
  db: Db,
  actor: Actor,
  id: string,
  note: string,
  opts: { confirmForwardBeforeRouting?: boolean } = {},
) {
  assertCan(actor.user, "registers.write");
  const closingNote = note.trim();
  if (!closingNote)
    throw new ValidationError([
      "Add a closing note: why is it closed without a letter?",
    ]);
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const row = await loadForWrite(tx, actor, id);
    const d = await refreshInward(tx, id, ctx);
    if (d.status === "Closed")
      throw new ValidationError([`${row.number} is already closed.`]);
    // Closing marks it forwarded today too, so the same confirm applies.
    const early = forwardingBeforeRouting(
      row,
      ctx.today,
      opts.confirmForwardBeforeRouting,
    );
    const data = {
      dateClosedManual: ctx.today,
      closingNote,
      dateForwarded: fromDbDate(row.dateForwarded) ?? ctx.today,
      ...(early && { forwardedBeforeRouting: true }),
    };
    const item = await tx.inwardItem.update({
      where: { id },
      data: {
        ...data,
        dateClosedManual: toDbDate(data.dateClosedManual),
        dateForwarded: toDbDate(data.dateForwarded),
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "close",
        entityType: "InwardItem",
        entityId: id,
        before: {
          dateClosedManual: fromDbDate(row.dateClosedManual),
          closingNote: row.closingNote,
          dateForwarded: fromDbDate(row.dateForwarded),
          ...(early && { forwardedBeforeRouting: false }),
        },
        after: data,
      },
      actor.now,
    );
    await refreshInward(tx, id, ctx);
    return { item, message: `${row.number} closed today.` };
  });
}
