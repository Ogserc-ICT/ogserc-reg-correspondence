// Reference data from seed-data.json (STACK rule 15). Fills empty tables only,
// so re-running never overwrites, re-adds or renames anything an admin edited.
import seed from "../../seed-data.json";
import type {
  HolidayStatus,
  ListKind,
  SlipFooter,
} from "../../src/generated/prisma/client";
import { audit } from "../../src/server/audit";
import type { Db, Tx } from "../../src/server/db";
import { toDbDate } from "../../src/server/dates";
import { normaliseEmails } from "../../src/domain/emails";
import { resolveTypeDefaultUnits } from "../../src/domain/reference-check";
import { CONFIRMED_DEFAULT_UNITS } from "../../src/server/v2-decisions";

/** Types whose slip carries the registration sentence until Q4 is answered (TEMPLATES §1). */
const REGISTRATION_FOOTER_TYPES = [
  "REG-01 Registration (new)",
  "OUN-01 Own-use notification",
  "Deficiency response",
  "Licence / permit application",
  "Licence renewal application",
];
const REGISTRATION_TYPE = "REG-01 Registration (new)";
const RELATED_NO_TYPES = [
  "Update - material change",
  "Annual confirmation",
  "Deficiency response",
];

/** System keys for the list values the rules depend on (see src/domain/rules.ts). */
const SYSTEM_KEYS: Partial<Record<ListKind, Record<string, string>>> = {
  RECEIPT_MODE: {
    "Hand delivery": "HAND_DELIVERY",
    Email: "EMAIL",
    "Online portal": "ONLINE_PORTAL",
    Courier: "COURIER",
    "Registered post": "REGISTERED_POST",
    "Internal mail": "INTERNAL_MAIL",
    "Publication / gazette": "PUBLICATION",
  },
  ACK_VIA: {
    "Printed slip": "PRINTED_SLIP",
    Email: "EMAIL",
    Portal: "PORTAL",
    "Not yet issued": "NOT_YET_ISSUED",
    "Not required": "NOT_REQUIRED",
  },
  ACTION_REQUIRED: {
    "Reply required": "REPLY_REQUIRED",
    "Action required": "ACTION_REQUIRED",
    "For information": "FOR_INFORMATION",
    "File only": "FILE_ONLY",
  },
  PRIORITY: { Urgent: "URGENT", High: "HIGH", Normal: "NORMAL", Low: "LOW" },
  FILE_CLASS: { "Personnel (confidential)": "PERSONNEL" },
  FILE_SECURITY: {
    Open: "OPEN",
    Restricted: "RESTRICTED",
    Confidential: "CONFIDENTIAL",
  },
  FILE_STATUS: { Open: "OPEN", Closed: "CLOSED", Archived: "ARCHIVED" },
};

const LISTS: [ListKind, string[]][] = [
  ["RECEIPT_MODE", seed.receiptModes],
  ["LGA", seed.lgas],
  ["ACK_VIA", seed.acknowledgementVia],
  ["PARTY_CATEGORY", seed.partyCategories],
  ["ACTION_REQUIRED", seed.actionRequired],
  ["PRIORITY", seed.priorities],
  ["FILE_CLASS", seed.fileClasses.map((c) => c.name)],
  ["FILE_SECURITY", seed.fileSecurity],
  ["FILE_STATUS", seed.fileStatuses],
];

/** Slip footers from TEMPLATES §1; "{closingTime}" is filled from settings. */
export const SLIP_FOOTERS = {
  registration:
    "This slip acknowledges receipt only. It is not a registration, licence or permit (para 11(3)). The Commission will decide a complete registration submission within thirty (30) days (para 13(1)) and will notify you of any missing information. Quote the acknowledgement number on all correspondence. Where you file electronically after {closingTime} or on a non-working day, your filing is received on the next working day (para 10(3)).",
  para103:
    "This slip acknowledges receipt only. Quote the acknowledgement number on all correspondence. Where you file electronically after {closingTime} or on a non-working day, your filing is received on the next working day (para 10(3)).",
  general:
    "This slip acknowledges receipt only. Please quote the acknowledgement number on all further correspondence with the Commission.",
};

/** "Provisional — confirm FG declaration" → PROVISIONAL + note. */
export function parseHolidayStatus(s: string): {
  status: HolidayStatus;
  note: string | null;
} {
  const [head, ...rest] = s.split("—").map((x) => x.trim());
  const status = head.toUpperCase();
  if (status !== "FIXED" && status !== "PROVISIONAL" && status !== "ESTIMATED")
    throw new Error(`Unknown holiday status: ${s}`);
  return { status, note: rest.join(" — ") || null };
}

function slipFooter(name: string, para103: boolean): SlipFooter {
  if (REGISTRATION_FOOTER_TYPES.includes(name)) return "REGISTRATION";
  return para103 ? "PARA103" : "GENERAL";
}

export type SeedIncomingType = (typeof seed.incomingTypes)[number];

/** The row for one seed incoming type (also used by upgrade-reference-v2). */
export function incomingTypeRow(
  t: SeedIncomingType,
  defaultUnitId: string,
  sortOrder: number,
) {
  return {
    name: t.name,
    category: t.category,
    defaultUnitId,
    orderRef: t.orderRef,
    responseTargetDays: t.responseTargetDays,
    para103SlipWording: t.para103SlipWording,
    slipFooter: slipFooter(t.name, t.para103SlipWording),
    isRegistration: t.name === REGISTRATION_TYPE,
    requiresRelatedOgsercNo: RELATED_NO_TYPES.includes(t.name),
    sortOrder,
  };
}

export type SeedCounts = Record<string, number>;

const emailsOf = (xs: readonly string[]) => normaliseEmails(xs).emails;

/** The workbook's "Display" mode becomes OFF at seed (Q-V2-1: no provider yet). */
export const SEED_ACK_EMAIL_MODE = "OFF" as const;

export async function seedReference(
  db: Db,
  now: Date,
  /** Notes for the operator (the seed CLI prints them). */
  log: (line: string) => void = () => {},
): Promise<SeedCounts> {
  return db.$transaction(async (tx) => {
    const added: SeedCounts = {};
    const bump = (k: string, n: number) => (added[k] = (added[k] ?? 0) + n);

    // A table (or one list) is seeded only while it is empty. Matching rows by
    // name would bring back a value an admin has since renamed or removed.
    if ((await tx.division.count()) === 0)
      bump(
        "divisions",
        (
          await tx.division.createMany({
            data: seed.divisions.map((d, i) => ({
              name: d.name,
              emails: emailsOf(d.emails),
              sortOrder: i,
            })),
          })
        ).count,
      );

    if ((await tx.unit.count()) === 0) {
      const divisions = new Map(
        (await tx.division.findMany()).map((d) => [d.name, d.id]),
      );
      bump(
        "units",
        (
          await tx.unit.createMany({
            data: seed.units.map((u, i) => {
              const divisionId = divisions.get(u.division);
              if (!divisionId)
                throw new Error(
                  `Unit '${u.name}': unknown division '${u.division}'`,
                );
              return {
                name: u.name,
                divisionId,
                unitGroup: u.unitGroup,
                emails: emailsOf(u.emails),
                sortOrder: i,
              };
            }),
          })
        ).count,
      );
    }

    for (const [list, labels] of LISTS) {
      if ((await tx.listItem.count({ where: { list } })) > 0) continue;
      const keys = SYSTEM_KEYS[list] ?? {};
      const { count } = await tx.listItem.createMany({
        data: labels.map((label, i) => ({
          list,
          label,
          sortOrder: i,
          systemKey: keys[label] ?? null,
          afterHoursCutoff:
            list === "RECEIPT_MODE" &&
            seed.settings.afterHoursModes.includes(label),
          noDeliveryConfirmation:
            list === "RECEIPT_MODE" &&
            seed.settings.noDeliveryConfirmationModes.includes(label),
          code:
            list === "FILE_CLASS"
              ? (seed.fileClasses.find((c) => c.name === label)?.code ?? null)
              : null,
        })),
      });
      bump("listItems", count);
    }

    if ((await tx.incomingType.count()) === 0) {
      const units = new Map(
        (await tx.unit.findMany()).map((u) => [u.name, u.id]),
      );
      // C2/E2: never create a unit for a type; use a confirmed replacement or stop.
      const resolved = resolveTypeDefaultUnits(
        seed.incomingTypes,
        units.keys(),
        CONFIRMED_DEFAULT_UNITS,
      );
      if (resolved.missing.length > 0)
        throw new Error(
          "Incoming types point at units that do not exist: " +
            resolved.missing
              .map((m) => `'${m.type}' → '${m.defaultUnit}'`)
              .join("; "),
        );
      for (const r of resolved.replaced)
        log(
          `'${r.type}' names '${r.from}', which is not a unit; using '${r.to}' (confirm on Admin › Types).`,
        );
      const { count } = await tx.incomingType.createMany({
        data: seed.incomingTypes.map((t, i) =>
          incomingTypeRow(t, units.get(resolved.unitByType.get(t.name)!)!, i),
        ),
      });
      bump("incomingTypes", count);
    }

    if ((await tx.outgoingType.count()) === 0)
      bump(
        "outgoingTypes",
        (
          await tx.outgoingType.createMany({
            data: seed.outgoingTypes.map((t, i) => ({ ...t, sortOrder: i })),
          })
        ).count,
      );

    if ((await tx.publicHoliday.count()) === 0)
      bump(
        "publicHolidays",
        (
          await tx.publicHoliday.createMany({
            data: seed.publicHolidays.map((h) => ({
              date: toDbDate(h.date),
              name: h.name,
              ...parseHolidayStatus(h.status),
            })),
          })
        ).count,
      );

    if ((await tx.signatory.count()) === 0)
      bump(
        "signatories",
        (
          await tx.signatory.createMany({
            data: seed.staffFromWorkbook.signatories.map((p, i) => ({
              name: p.name,
              designation: p.designation,
              isDefault: p.designation === "Secretary to the Commission",
              sortOrder: i,
            })),
          })
        ).count,
      );

    bump("settings", await seedSettings(tx));

    await audit(
      tx,
      {
        userId: null,
        action: "seed-reference",
        entityType: "Seed",
        entityId: "seed-data.json",
        after: added,
      },
      now,
    );
    return added;
  });
}

async function seedSettings(tx: Tx): Promise<number> {
  if (await tx.registrySettings.findUnique({ where: { id: 1 } })) return 0;
  const s = seed.settings;
  await tx.registrySettings.create({
    data: {
      id: 1,
      ackPrefix: s.ackPrefix,
      outPrefix: s.outPrefix,
      officeClosingTime: s.officeClosingTime,
      timezone: s.timezone,
      registryForwardingTargetDays: s.registryForwardingTargetDays,
      dispatchTargetDays: s.dispatchTargetDays,
      chaseProofOfDeliveryAfterDays: s.chaseProofOfDeliveryAfterDays,
      urgentResponseTargetDays: s.urgentResponseTargetDays,
      defaultResponseTargetDays: s.defaultResponseTargetDays,
      fileReturnTargetDays: s.fileReturnTargetDays,
      effectiveDate: toDbDate(s.effectiveDate),
      effectiveDateIsPlaceholder: s.effectiveDateIsPlaceholder,
      registrationDeadlineDays: s.registrationDeadlineDays,
      dashboardFirstMonth: toDbDate(s.dashboardFirstMonth),
      registryAddress: s.registryAddress,
      slipFooterRegistration: SLIP_FOOTERS.registration,
      slipFooterPara103: SLIP_FOOTERS.para103,
      slipFooterGeneral: SLIP_FOOTERS.general,
      frontDeskPrefix: s.frontDeskPrefix,
      filePrefix: s.filePrefix,
      fileRefSerialDigits: s.fileRefSerialDigits,
      ackEmailMode: SEED_ACK_EMAIL_MODE,
      ackEmailCc: s.ackEmailCc,
    },
  });
  return 1;
}
