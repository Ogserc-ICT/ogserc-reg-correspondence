// The workbook example scenario (SPEC §12.2) as plain records, with the links
// resolved the way the server will resolve foreign keys. Ids are readable
// names; list ids are the seed labels.
import seed from "../../seed-data.json";
import type { IsoDate } from "@/domain/calendar";
import { instantIn } from "@/domain/clock";
import { dashboardSummary } from "@/domain/dashboard";
import { deriveFile, type FileFacts, type MovementFacts } from "@/domain/files";
import {
  deriveInward,
  reg01CacDuplicates,
  type IncomingTypeSnapshot,
  type InwardFacts,
} from "@/domain/inward";
import {
  deriveOutward,
  type OutgoingTypeSnapshot,
  type OutwardFacts,
} from "@/domain/outward";
import { deemedReceiptDate } from "@/domain/receipt";
import type { RuleContext } from "@/domain/rules";
import { seedHolidays, seedRules } from "./rules";

const REG_01 = "REG-01 Registration (new)";
const NEEDS_RELATED_NO = [
  "Update - material change",
  "Annual confirmation",
  "Deficiency response",
];

export function incomingType(name: string): IncomingTypeSnapshot {
  const t = seed.incomingTypes.find((x) => x.name === name);
  if (!t) throw new Error(`No incoming type ${name}`);
  return {
    name: t.name,
    category: t.category,
    orderRef: t.orderRef,
    defaultUnitId: t.defaultUnit,
    responseTargetDays: t.responseTargetDays,
    isRegistration: t.name === REG_01,
    requiresRelatedOgsercNo: NEEDS_RELATED_NO.includes(t.name),
  };
}

export function outgoingType(name: string): OutgoingTypeSnapshot & {
  closesInwardItem: boolean;
} {
  const t = seed.outgoingTypes.find((x) => x.name === name);
  if (!t) throw new Error(`No outgoing type ${name}`);
  return { ...t };
}

export type InwardRow = Omit<
  InwardFacts,
  "replies" | "possibleDuplicateCac" | "deemedReceiptDate"
> & {
  id: string;
  inResponseToOutwardId: string | null;
  fileRef: string | null;
};

export type OutwardRow = Omit<OutwardFacts, "responses"> & {
  id: string;
  closesInwardItem: boolean;
  fileRef: string | null;
};

export type FileRow = Omit<FileFacts, "inward" | "outward">;

export type Scenario = {
  inward: InwardRow[];
  outward: OutwardRow[];
  files: FileRow[];
};

export function inwardRow(
  p: Partial<InwardRow> &
    Pick<InwardRow, "id" | "number" | "receivedAt" | "modeId" | "type">,
): InwardRow {
  return {
    numberYear: Number(p.number.split("/")[2]),
    sender: "Sample sender",
    senderCategoryId: "Registrant / licensee",
    subject: "Sample subject",
    receivedById: "registry-officer-1",
    ackIssuedVia: "PRINTED_SLIP",
    actionRequired: "ACTION_REQUIRED",
    priority: null,
    unitOverrideId: null,
    responseDueOverride: null,
    relatedOgsercNo: null,
    cacNo: null,
    schedule2DocsAttached: null,
    feeEvidenceAttached: null,
    multiState: null,
    registrationDeadlineOverride: null,
    dateForwarded: null,
    dateClosedManual: null,
    voided: false,
    inResponseToOutwardId: null,
    fileRef: null,
    ...p,
  };
}

export function outwardRow(
  p: Partial<OutwardRow> &
    Pick<OutwardRow, "id" | "number" | "documentDate" | "dispatchModeId"> & {
      typeName: string;
    },
): OutwardRow {
  const { typeName, ...rest } = p;
  const { closesInwardItem, ...type } = outgoingType(typeName);
  return {
    type,
    closesInwardItem,
    dateDispatched: null,
    deliveryConfirmed: null,
    dateDelivered: null,
    responseExpectedOverride: null,
    responseDueOverride: null,
    inReplyToInwardId: null,
    voided: false,
    fileRef: null,
    ...rest,
  };
}

export function movement(
  p: Omit<
    MovementFacts,
    "returnByOverride" | "dateReturned" | "issuedWhileOut"
  > &
    Partial<MovementFacts>,
): MovementFacts {
  return {
    returnByOverride: null,
    dateReturned: null,
    issuedWhileOut: false,
    ...p,
  };
}

export function workbookExample(): Scenario {
  return {
    inward: [
      inwardRow({
        id: "I1",
        number: "OGSERC/ACK/2026/00001",
        receivedAt: instantIn("2026-11-20", "10:15"),
        modeId: "Hand delivery",
        type: incomingType(REG_01),
        sender: "Sample Mini-Grid Ltd",
        senderCategoryId: "Registrant / licensee",
        subject: "Registration of mini-grid",
        cacNo: "RC0000000",
        schedule2DocsAttached: 12,
        feeEvidenceAttached: true,
        dateForwarded: "2026-11-20",
        ackIssuedVia: "PRINTED_SLIP",
        actionRequired: "ACTION_REQUIRED",
        fileRef: "OGSERC/RL/001",
      }),
      inwardRow({
        id: "I2",
        number: "OGSERC/ACK/2026/00002",
        receivedAt: instantIn("2026-11-30", "18:40"),
        modeId: "Email",
        type: incomingType("Deficiency response"),
        sender: "Sample Mini-Grid Ltd",
        relatedOgsercNo: "ACK/2026/00001",
        inResponseToOutwardId: "O1",
        schedule2DocsAttached: 1,
        ackIssuedVia: "EMAIL",
        actionRequired: "ACTION_REQUIRED",
        fileRef: "OGSERC/RL/001",
      }),
      inwardRow({
        id: "I3",
        number: "OGSERC/ACK/2026/00003",
        receivedAt: instantIn("2026-12-02", "11:05"),
        modeId: "Hand delivery",
        type: incomingType("Letter from NERC / Federal agency"),
        sender: "NERC",
        senderCategoryId: "NERC",
        unitOverrideId: "Office of the Chairman",
        dateForwarded: "2026-12-02",
        ackIssuedVia: "NOT_REQUIRED",
        actionRequired: "REPLY_REQUIRED",
        priority: "HIGH",
        fileRef: "OGSERC/GOV/001",
      }),
    ],
    outward: [
      outwardRow({
        id: "O1",
        number: "OGSERC/OUT/2026/00001",
        typeName: "Deficiency notice",
        documentDate: "2026-11-25",
        inReplyToInwardId: "I1",
        dispatchModeId: "Email",
        dateDispatched: "2026-11-25",
        deliveryConfirmed: true,
        dateDelivered: "2026-11-25",
        fileRef: "OGSERC/RL/001",
      }),
      outwardRow({
        id: "O2",
        number: "OGSERC/OUT/2026/00002",
        typeName: "Letter to NERC / Federal agency",
        documentDate: "2026-12-02",
        inReplyToInwardId: "I3",
        dispatchModeId: "Courier",
        dateDispatched: "2026-12-03",
        fileRef: "OGSERC/GOV/001",
      }),
    ],
    files: [
      {
        reference: "OGSERC/RL/001",
        fileStatus: "OPEN",
        dateClosedOrArchived: null,
        movements: [
          movement({
            id: "M1",
            outAt: instantIn("2026-11-20", "14:00"),
            issuedTo: "Reg. Officer",
            unitName: "Registration & Licensing",
            dateReturned: "2026-11-25",
          }),
        ],
      },
      {
        reference: "OGSERC/GOV/001",
        fileStatus: "OPEN",
        dateClosedOrArchived: null,
        movements: [
          movement({
            id: "M2",
            outAt: instantIn("2026-12-02", "11:30"),
            issuedTo: "PA to Chairman",
            unitName: "Office of the Chairman",
          }),
        ],
      },
    ],
  };
}

export function contextOn(today: IsoDate): RuleContext {
  return { rules: seedRules, holidays: seedHolidays, today };
}

/** Resolves links and derives everything, as the server will for a page. */
export function evaluate(s: Scenario, today: IsoDate) {
  const ctx = contextOn(today);
  const deemed = new Map(
    s.inward.map((i) => [
      i.id,
      deemedReceiptDate(i.receivedAt!, i.modeId!, seedRules, seedHolidays),
    ]),
  );
  const dupes = reg01CacDuplicates(
    s.inward.map((i) => ({
      id: i.id,
      isRegistration: i.type?.isRegistration ?? false,
      cacNo: i.cacNo,
      voided: i.voided,
    })),
  );

  const inward = new Map(
    s.inward.map((i) => {
      const { id, inResponseToOutwardId, fileRef, ...rest } = i;
      void inResponseToOutwardId;
      void fileRef;
      const facts: InwardFacts = {
        ...rest,
        deemedReceiptDate: deemed.get(id)!,
        possibleDuplicateCac: dupes.has(id),
        replies: s.outward
          .filter((o) => o.inReplyToInwardId === id)
          .map((o) => ({
            id: o.id,
            number: o.number,
            dateDispatched: o.dateDispatched,
            closesInwardItem: o.closesInwardItem,
            voided: o.voided,
          })),
      };
      return [id, { facts, derived: deriveInward(facts, ctx) }] as const;
    }),
  );

  const outward = new Map(
    s.outward.map((o) => {
      const { id, closesInwardItem, fileRef, ...rest } = o;
      void closesInwardItem;
      void fileRef;
      const facts: OutwardFacts = {
        ...rest,
        responses: s.inward
          .filter((i) => i.inResponseToOutwardId === id)
          .map((i) => ({
            id: i.id,
            number: i.number,
            deemedReceiptDate: deemed.get(i.id)!,
            voided: i.voided,
          })),
      };
      return [id, { facts, derived: deriveOutward(facts, ctx) }] as const;
    }),
  );

  const files = new Map(
    s.files.map((f) => {
      const facts: FileFacts = {
        ...f,
        inward: s.inward
          .filter((i) => i.fileRef === f.reference)
          .map((i) => ({
            deemedReceiptDate: deemed.get(i.id)!,
            voided: i.voided,
          })),
        outward: s.outward
          .filter((o) => o.fileRef === f.reference)
          .map((o) => ({ documentDate: o.documentDate, voided: o.voided })),
      };
      return [f.reference, { facts, derived: deriveFile(facts, ctx) }] as const;
    }),
  );

  const dashboard = dashboardSummary({
    today,
    inward: [...inward.values()],
    outward: [...outward.values()],
    files: [...files.values()],
  });

  return { ctx, inward, outward, files, dashboard };
}
