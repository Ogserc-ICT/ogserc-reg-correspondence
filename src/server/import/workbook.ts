// Workbook import (STACK rule 19): bring items logged in the Registry
// Correspondence Workbook during the parallel run into the app.
//
// - Dry run by default: everything is done in one transaction and rolled back,
//   so the report shows exactly what a real import would do.
// - Original ACK/OUT numbers are kept and the counters moved past them.
// - Nothing is duplicated: numbers, file references and movements already in
//   the app are skipped, so the import can be run again safely.
// - Items go through the same create code as the app (deemed date, snapshot,
//   status), are marked imported, and audited as "import".
import ExcelJS from "exceljs";
import { addDays } from "@/domain/calendar";
import { dateIn, instantIn } from "@/domain/clock";
import { parseNumber } from "@/domain/numbering";
import type { Principal } from "@/domain/permissions";
import { deemedReceiptDate } from "@/domain/receipt";
import type { ListKind } from "@/generated/prisma/client";
import { audit } from "../audit";
import { toDbDate } from "../dates";
import type { Db, Tx } from "../db";
import { assertCan, ValidationError } from "../errors";
import {
  createInward,
  createOutward,
  refreshInward,
  refreshOutward,
  type Actor,
} from "../registers";
import { loadRuleContext } from "../rules";
import { SPLIT_TYPE, UNIT_RENAME_MAP } from "@/server/v2-decisions";

export type SheetReport = {
  created: number;
  skippedExisting: number;
  skippedExamples: number;
};

export type ImportReport = {
  committed: boolean;
  files: SheetReport;
  inward: SheetReport;
  outward: SheetReport;
  movements: SheetReport;
  errors: string[];
  warnings: string[];
};

const FIRST_ROW = 6; // rows 1–5 are titles and headers in every register
const HEADER_ROW = 5;

export const COLS = {
  inward: {
    number: "Inward / Ack. No. in Use",
    receivedAt: "Date & Time Received *",
    mode: "Mode of Receipt *",
    deemed: "Deemed Receipt Date (para 10(3))",
    type: "Correspondence Type *",
    sender: "Sender / Organisation *",
    senderCategory: "Sender Category *",
    senderRef: "Sender's Ref. No.",
    documentDate: "Date on Document",
    subject: "Subject / Brief Description *",
    cacNo: "CAC / Reg. No.",
    related: "Related OGSERC No. (registration / earlier ack.)",
    inResponseTo: "In Response to Our Ref. (outward no.)",
    lga: "Principal LGA",
    contactPerson: "Contact Person",
    phone: "Phone",
    email: "Email",
    deliveredBy: "Delivered / Sent by",
    volumes: "No. of Files / Volumes",
    sch2: "Schedule 2 Docs Attached (12 req.; 13 multi-State)",
    fee: "Fee Evidence? (Y/N)",
    paymentRef: "Payment Reference",
    amount: "Amount Shown (₦)",
    receivedBy: "Received by (Registry Officer) *",
    fileRef: "File Reference",
    unitOverride: "Forward to Unit (override)",
    dateForwarded: "Date Forwarded",
    receivedByUnitOfficer: "Received by (Unit Officer)",
    ackVia: "Acknowledgement Issued Via *",
    action: "Action Required *",
    priority: "Priority (blank = Normal)",
    actionOfficer: "Action Officer",
    responseDueOverride: "Response Due (override)",
    dateClosedManual: "Date Closed (manual, if no letter)",
    remarks: "Remarks",
  },
  outward: {
    number: "Outward No. in Use",
    documentDate: "Date of Document *",
    type: "Document Type *",
    subject: "Subject *",
    addressee: "Addressee / Recipient *",
    recipientCategory: "Recipient Category *",
    contact: "Recipient Address / Email",
    related: "Related OGSERC No. (registration / licence)",
    inReplyTo: "In Reply to (inward no.)",
    fileRef: "File Reference",
    unit: "Originating Unit *",
    preparedBy: "Prepared by",
    signedBy: "Signed by *",
    designation: "Signatory Designation",
    dispatchMode: "Dispatch Mode *",
    dateDispatched: "Date Dispatched",
    dispatchedBy: "Dispatched by (Registry Officer)",
    trackingRef: "Tracking / Email / Courier Ref.",
    deliveryConfirmed: "Delivery Confirmed? (Y/N)",
    dateDelivered: "Date Delivered / Acknowledged",
    receivedByRecipient: "Received by (Recipient)",
    responseExpected: "Response Expected? (Y/N; blank = type default)",
    responseDueOverride: "Response Due (override)",
    remarks: "Remarks",
  },
  files: {
    reference: "File Reference *",
    title: "File Title *",
    fileClass: "File Class",
    unit: "Owning Unit",
    dateOpened: "Date Opened",
    volume: "Current Volume",
    security: "Security",
    status: "File Status",
    dateClosed: "Date Closed / Archived",
    remarks: "Remarks",
  },
  movements: {
    outAt: "Date & Time Out *",
    fileRef: "File Reference *",
    volume: "Volume",
    releasedBy: "Released by (Registry) *",
    issuedTo: "Issued to (Officer) *",
    unit: "Unit",
    purpose: "Purpose",
    returnBy: "Return By (override)",
    dateReturned: "Date Returned",
    receivedBackBy: "Received Back by",
  },
} as const;

/**
 * Columns only the v2 workbook has (SPEC-v2 C5, C6, C3). Optional, so a v1
 * workbook still imports. The Front Desk Log sheet is never read (E10).
 */
export const V2_INWARD = {
  routedBy: "Routed by (Secretary / Head of Admin)",
  routedOn: "Routed on",
  ackEmailedTo: "Ack. emailed to",
  ackEmailedOn: "Ack. emailed on",
  intakeNo: "Front Desk Intake No.",
} as const;

export const SHEETS = {
  inward: "Inward Register",
  outward: "Outward Register",
  files: "File Index",
  movements: "File Movement",
} as const;

export type Row = {
  n: number;
  get: (header: string) => unknown;
  /** False for an optional column the sheet doesn't have. */
  has: (header: string) => boolean;
};

/** A formula cell's cached result, rich text as plain text, otherwise the value. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return plain(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return null;
    return null;
  }
  return v;
}

export function readSheet(
  wb: ExcelJS.Workbook,
  sheet: string,
  headers: readonly string[],
  optional: readonly string[] = [],
): Row[] {
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new ValidationError([`The workbook has no "${sheet}" sheet.`]);
  const col = new Map<string, number>();
  ws.getRow(HEADER_ROW).eachCell((cell, c) => {
    const h = plain(cell.value);
    if (typeof h === "string") col.set(h.trim(), c);
  });
  const missing = headers.filter((h) => !col.has(h));
  if (missing.length)
    throw new ValidationError(
      missing.map(
        (h) =>
          `"${sheet}" has no column "${h}". Is this the Registry Correspondence Workbook?`,
      ),
    );
  const rows: Row[] = [];
  for (let n = FIRST_ROW; n <= ws.rowCount; n++) {
    const r = ws.getRow(n);
    const has = (h: string) => col.has(h);
    const get = (h: string) =>
      col.has(h) ? plain(r.getCell(col.get(h)!).value) : null;
    rows.push({ n, get, has });
  }
  return rows;
}

// Excel stores wall-clock times; exceljs returns them as UTC Dates.
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const hhmmOf = (d: Date) => d.toISOString().slice(11, 16);

export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? isoOf(v) : String(v)).trim();
  return s ? s : null;
}
export function date(v: unknown): string | null {
  if (v instanceof Date) return isoOf(v);
  const s = text(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
export function instant(v: unknown): Date | null {
  return v instanceof Date ? instantIn(isoOf(v), hhmmOf(v)) : null;
}
function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(text(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function yesNo(v: unknown): boolean | null {
  const s = text(v)?.toUpperCase();
  return s === "Y" || s === "YES"
    ? true
    : s === "N" || s === "NO"
      ? false
      : null;
}
export const isExample = (...values: unknown[]) =>
  values.some((v) => text(v)?.toUpperCase().startsWith("EXAMPLE"));
const key = (s: string) => s.trim().toLowerCase();

const emptyReport = (): SheetReport => ({
  created: 0,
  skippedExisting: 0,
  skippedExamples: 0,
});

class DryRun extends Error {}

/**
 * Imports `file`. `as` must be a Head of Registry: they are the actor in the
 * audit log, and stand in for any officer name that matches no user.
 */
export async function importWorkbook(
  db: Db,
  input: {
    file: string | Buffer;
    as: Principal;
    now: Date;
    commit: boolean;
    includeExamples?: boolean;
  },
): Promise<ImportReport> {
  assertCan(input.as, "items.editAny");
  const wb = new ExcelJS.Workbook();
  if (typeof input.file === "string") await wb.xlsx.readFile(input.file);
  else await wb.xlsx.load(input.file as unknown as ArrayBuffer);

  const sheets = {
    files: readSheet(wb, SHEETS.files, Object.values(COLS.files)),
    inward: readSheet(
      wb,
      SHEETS.inward,
      Object.values(COLS.inward),
      Object.values(V2_INWARD),
    ),
    outward: readSheet(wb, SHEETS.outward, Object.values(COLS.outward)),
    movements: readSheet(wb, SHEETS.movements, Object.values(COLS.movements)),
  };

  const report: ImportReport = {
    committed: false,
    files: emptyReport(),
    inward: emptyReport(),
    outward: emptyReport(),
    movements: emptyReport(),
    errors: [],
    warnings: [],
  };
  const actor: Actor = { user: input.as, now: input.now };

  try {
    await db.$transaction(
      async (tx) => {
        await run(tx, sheets, actor, report, !!input.includeExamples);
        if (report.errors.length || !input.commit) throw new DryRun();
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );
    report.committed = true;
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  return report;
}

/**
 * v1 workbook names that v2 renamed (C1.1, C2) resolve to their new rows,
 * unless a row with the old name still exists.
 */
function withAliases(
  byKey: Map<string, string>,
  aliases: Readonly<Record<string, string>>,
): Map<string, string> {
  for (const [from, to] of Object.entries(aliases)) {
    const id = byKey.get(key(to));
    if (id && !byKey.has(key(from))) byKey.set(key(from), id);
  }
  return byKey;
}

async function lookups(tx: Tx) {
  const lists = await tx.listItem.findMany();
  const units = await tx.unit.findMany();
  const inTypes = await tx.incomingType.findMany();
  const outTypes = await tx.outgoingType.findMany();
  const users = await tx.user.findMany();
  const signatories = await tx.signatory.findMany();
  const byLabel = (xs: { id: string; label: string }[]) =>
    new Map(xs.map((x) => [key(x.label), x.id]));
  return {
    list: (kind: ListKind) => byLabel(lists.filter((l) => l.list === kind)),
    units: withAliases(
      new Map(units.map((u) => [key(u.name), u.id])),
      UNIT_RENAME_MAP,
    ),
    inTypes: withAliases(new Map(inTypes.map((t) => [key(t.name), t.id])), {
      [SPLIT_TYPE.old]: SPLIT_TYPE.renamedTo,
    }),
    outTypes: new Map(outTypes.map((t) => [key(t.name), t.id])),
    registryUsers: new Map(
      users
        .filter(
          (u) => u.role === "REGISTRY_OFFICER" || u.role === "HEAD_OF_REGISTRY",
        )
        .map((u) => [key(u.name), u.id]),
    ),
    // SPEC-v2 C5: the router named in "Routed by", any active user.
    users: new Map(users.map((u) => [key(u.name), u.id])),
    // SPEC-v2 C7: matched against the signatory list by name.
    signatories: new Map(signatories.map((s) => [key(s.name), s.id])),
  };
}

async function run(
  tx: Tx,
  sheets: Record<keyof typeof SHEETS, Row[]>,
  actor: Actor,
  report: ImportReport,
  includeExamples: boolean,
) {
  const L = await lookups(tx);
  const ctx = await loadRuleContext(tx, actor.now);
  const settings = await tx.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  const err = (sheet: string, n: number, msg: string) =>
    report.errors.push(`${sheet} row ${n}: ${msg}`);
  const warn = (sheet: string, n: number, msg: string) =>
    report.warnings.push(`${sheet} row ${n}: ${msg}`);

  /** A required lookup: id, or an error naming the bad value. */
  const need = (
    map: Map<string, string>,
    v: unknown,
    label: string,
    sheet: string,
    n: number,
    required = true,
  ): string | null => {
    const s = text(v);
    if (!s) {
      if (required) err(sheet, n, `${label} is empty.`);
      return null;
    }
    const id = map.get(key(s));
    if (!id)
      err(
        sheet,
        n,
        `${label} "${s}" is not in the app's list. Add it or correct the workbook.`,
      );
    return id ?? null;
  };
  /** An officer name → user, or the importing Head of Registry with a warning. */
  const officer = (
    v: unknown,
    label: string,
    sheet: string,
    n: number,
    notes: string[],
  ) => {
    const s = text(v);
    const id = s ? L.registryUsers.get(key(s)) : undefined;
    if (id) return id;
    if (s) {
      notes.push(`${label}: ${s}`);
      warn(
        sheet,
        n,
        `${label} "${s}" is not a user; recorded as the importing Head of Registry.`,
      );
    }
    return actor.user.id;
  };
  const withNotes = (remarks: string | null, notes: string[]) =>
    notes.length
      ? [remarks, `[Workbook] ${notes.join("; ")}`].filter(Boolean).join(" ")
      : remarks;

  // ---- File Index ----------------------------------------------------------
  const F = COLS.files;
  const fileIds = new Map(
    (
      await tx.registryFile.findMany({ select: { id: true, reference: true } })
    ).map((f) => [f.reference, f.id]),
  );
  const openSecurity = L.list("FILE_SECURITY").get("open");
  const openStatus = L.list("FILE_STATUS").get("open");
  for (const r of sheets.files) {
    const ref = text(r.get(F.reference))?.replace(/\s+/g, "").toUpperCase();
    if (!ref) continue;
    if (isExample(r.get(F.title)) && !includeExamples) {
      report.files.skippedExamples++;
      continue;
    }
    if (fileIds.has(ref)) {
      report.files.skippedExisting++;
      continue;
    }
    const title = text(r.get(F.title));
    if (!title) {
      err(SHEETS.files, r.n, "File Title is empty.");
      continue;
    }
    const securityId = text(r.get(F.security))
      ? need(
          L.list("FILE_SECURITY"),
          r.get(F.security),
          "Security",
          SHEETS.files,
          r.n,
        )
      : openSecurity;
    const fileStatusId = text(r.get(F.status))
      ? need(
          L.list("FILE_STATUS"),
          r.get(F.status),
          "File Status",
          SHEETS.files,
          r.n,
        )
      : openStatus;
    const fileClassId = need(
      L.list("FILE_CLASS"),
      r.get(F.fileClass),
      "File Class",
      SHEETS.files,
      r.n,
      false,
    );
    const owningUnitId = need(
      L.units,
      r.get(F.unit),
      "Owning Unit",
      SHEETS.files,
      r.n,
      false,
    );
    if (!securityId || !fileStatusId) continue;
    const file = await tx.registryFile.create({
      data: {
        reference: ref,
        title,
        fileClassId,
        owningUnitId,
        dateOpened: toDbDate(date(r.get(F.dateOpened)) ?? ctx.today),
        currentVolume: int(r.get(F.volume)) || 1,
        securityId,
        fileStatusId,
        dateClosedOrArchived: toDbDate(date(r.get(F.dateClosed))),
        remarks: text(r.get(F.remarks)),
        createdById: actor.user.id,
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "import",
        entityType: "RegistryFile",
        entityId: file.id,
        after: file,
      },
      actor.now,
    );
    fileIds.set(ref, file.id);
    report.files.created++;
  }
  const fileOf = (v: unknown, sheet: string, n: number) => {
    const ref = text(v)?.replace(/\s+/g, "").toUpperCase();
    if (!ref) return null;
    const id = fileIds.get(ref);
    if (!id)
      warn(
        sheet,
        n,
        `File ${ref} is not in the File Index; the link is left empty.`,
      );
    return id ?? null;
  };

  /**
   * SPEC-v2 routing on import. v2 workbook: "Routed on" (and the router, if
   * they are a user here). v1 workbook: routing happened at registration, so
   * a row with an action counts as routed when received. The workbook's
   * "Ack. emailed" columns are not imported: it marks an email as sent even
   * when it was only displayed (E1). Front desk intakes are never imported
   * (E10).
   */
  let v1RoutedRows = 0;
  const importRouting = async (
    tx: Tx,
    r: Row,
    itemId: string,
    receivedAt: Date,
    actionRequiredId: string | null,
    S: string,
  ) => {
    let routedAt: Date | null = null;
    let routedById: string | null = null;
    if (r.has(V2_INWARD.routedOn)) {
      routedAt = instant(r.get(V2_INWARD.routedOn));
      const by = text(r.get(V2_INWARD.routedBy));
      if (routedAt && by) {
        routedById = L.users.get(key(by)) ?? null;
        if (!routedById)
          warn(
            S,
            r.n,
            `"${by}" (Routed by) is not a user in the app; the routing is kept without a name.`,
          );
      }
    } else if (actionRequiredId) {
      routedAt = receivedAt;
      v1RoutedRows++;
    }
    if (text(r.get(V2_INWARD.ackEmailedTo)))
      warn(
        S,
        r.n,
        `"Ack. emailed to" is not imported: the workbook records an email as sent even when it was only displayed (E1). Use Resend if the unit needs it.`,
      );
    const intakeNo = text(r.get(V2_INWARD.intakeNo));
    if (intakeNo)
      warn(
        S,
        r.n,
        `Front desk intake ${intakeNo} is not imported (the Front Desk Log is never imported).`,
      );
    if (!routedAt) return;
    await tx.inwardItem.update({
      where: { id: itemId },
      data: { routedAt, routedById },
    });
    if (routedById)
      await tx.routingEvent.create({
        data: {
          inwardItemId: itemId,
          routedById,
          routedAt,
          before: {},
          after: { source: "Imported from the workbook" },
        },
      });
    await refreshInward(tx, itemId, ctx);
  };

  // ---- Inward Register, first pass ------------------------------------------
  const I = COLS.inward;
  const imported: { inward: string[]; outward: string[] } = {
    inward: [],
    outward: [],
  };
  const pendingResponseLinks: { id: string; outwardNo: string; n: number }[] =
    [];
  for (const r of sheets.inward) {
    const no = text(r.get(I.number));
    const sender = text(r.get(I.sender));
    if (!no || !sender) continue;
    if (isExample(sender) && !includeExamples) {
      report.inward.skippedExamples++;
      continue;
    }
    if (await tx.inwardItem.count({ where: { number: no } })) {
      report.inward.skippedExisting++;
      continue;
    }
    const parsed = parseNumber(no);
    const S = SHEETS.inward;
    if (!parsed) {
      err(S, r.n, `"${no}" is not an inward number.`);
      continue;
    }
    if (parsed.prefix !== settings.ackPrefix)
      warn(
        S,
        r.n,
        `${no} has prefix ${parsed.prefix}; the app issues ${settings.ackPrefix}.`,
      );
    const before = report.errors.length;
    const receivedAt = instant(r.get(I.receivedAt));
    if (!receivedAt)
      err(S, r.n, "Date & Time Received is empty or not a date.");
    const subject = text(r.get(I.subject));
    if (!subject) err(S, r.n, "Subject is empty.");
    const modeId = need(
      L.list("RECEIPT_MODE"),
      r.get(I.mode),
      "Mode of Receipt",
      S,
      r.n,
    );
    const typeId = need(
      L.inTypes,
      r.get(I.type),
      "Correspondence Type",
      S,
      r.n,
    );
    const senderCategoryId = need(
      L.list("PARTY_CATEGORY"),
      r.get(I.senderCategory),
      "Sender Category",
      S,
      r.n,
    );
    const ackIssuedViaId = need(
      L.list("ACK_VIA"),
      r.get(I.ackVia),
      "Acknowledgement Issued Via",
      S,
      r.n,
    );
    // Set on the Routing Desk in v2 (C4): blank until routed.
    const actionRequiredId = need(
      L.list("ACTION_REQUIRED"),
      r.get(I.action),
      "Action Required",
      S,
      r.n,
      false,
    );
    const priorityId = need(
      L.list("PRIORITY"),
      r.get(I.priority),
      "Priority",
      S,
      r.n,
      false,
    );
    const principalLgaId = need(
      L.list("LGA"),
      r.get(I.lga),
      "Principal LGA",
      S,
      r.n,
      false,
    );
    const unitOverrideId = need(
      L.units,
      r.get(I.unitOverride),
      "Forward to Unit (override)",
      S,
      r.n,
      false,
    );
    if (report.errors.length > before) continue;

    const notes: string[] = [];
    const receivedById = officer(
      r.get(I.receivedBy),
      "Received by",
      S,
      r.n,
      notes,
    );
    const amount = r.get(I.amount);
    const deemed = deemedReceiptDate(
      receivedAt!,
      modeId!,
      ctx.rules,
      ctx.holidays,
    );
    const wbDeemed = date(r.get(I.deemed));
    if (wbDeemed && wbDeemed !== deemed)
      warn(
        S,
        r.n,
        `${no}: the workbook's deemed date ${wbDeemed} differs from the app's ${deemed} (holidays or cut-off).`,
      );

    const item = await createInward(
      tx,
      {
        receivedAt: receivedAt!,
        modeId: modeId!,
        typeId: typeId!,
        sender,
        senderCategoryId: senderCategoryId!,
        subject: subject!,
        receivedById,
        ackIssuedViaId: ackIssuedViaId!,
        actionRequiredId,
        priorityId,
        senderRef: text(r.get(I.senderRef)),
        documentDate: date(r.get(I.documentDate)),
        relatedOgsercNo: text(r.get(I.related)),
        cacNo: text(r.get(I.cacNo)),
        principalLgaId,
        contactPerson: text(r.get(I.contactPerson)),
        phone: text(r.get(I.phone)),
        email: text(r.get(I.email)),
        deliveredBy: text(r.get(I.deliveredBy)),
        volumes: int(r.get(I.volumes)),
        schedule2DocsAttached: int(r.get(I.sch2)),
        feeEvidenceAttached: yesNo(r.get(I.fee)),
        paymentRef: text(r.get(I.paymentRef)),
        amountShownKobo:
          typeof amount === "number" ? BigInt(Math.round(amount * 100)) : null,
        fileId: fileOf(r.get(I.fileRef), S, r.n),
        unitOverrideId,
        actionOfficer: text(r.get(I.actionOfficer)),
        responseDueOverride: date(r.get(I.responseDueOverride)),
        remarks: withNotes(text(r.get(I.remarks)), notes),
        dateForwarded: date(r.get(I.dateForwarded)),
        receivedByUnitOfficer: text(r.get(I.receivedByUnitOfficer)),
        dateClosedManual: date(r.get(I.dateClosedManual)),
        closingNote: date(r.get(I.dateClosedManual))
          ? "Closed in the workbook"
          : null,
      },
      actor,
      { preset: { number: no, year: parsed.year, serial: parsed.serial } },
    );
    await importRouting(tx, r, item.id, receivedAt!, actionRequiredId, S);
    imported.inward.push(item.id);
    report.inward.created++;
    const outNo = text(r.get(I.inResponseTo));
    if (outNo)
      pendingResponseLinks.push({ id: item.id, outwardNo: outNo, n: r.n });
  }

  if (v1RoutedRows)
    report.warnings.push(
      `${v1RoutedRows} inward item(s) from a workbook without a Routing Desk are marked routed when received (they were routed at registration).`,
    );

  // ---- Outward Register --------------------------------------------------------
  const O = COLS.outward;
  for (const r of sheets.outward) {
    const no = text(r.get(O.number));
    const addressee = text(r.get(O.addressee));
    if (!no || !addressee) continue;
    if (isExample(addressee) && !includeExamples) {
      report.outward.skippedExamples++;
      continue;
    }
    if (await tx.outwardItem.count({ where: { number: no } })) {
      report.outward.skippedExisting++;
      continue;
    }
    const S = SHEETS.outward;
    const parsed = parseNumber(no);
    if (!parsed) {
      err(S, r.n, `"${no}" is not an outward number.`);
      continue;
    }
    if (parsed.prefix !== settings.outPrefix)
      warn(
        S,
        r.n,
        `${no} has prefix ${parsed.prefix}; the app issues ${settings.outPrefix}.`,
      );
    const before = report.errors.length;
    const documentDate = date(r.get(O.documentDate));
    if (!documentDate) err(S, r.n, "Date of Document is empty or not a date.");
    const subject = text(r.get(O.subject));
    if (!subject) err(S, r.n, "Subject is empty.");
    const typeId = need(L.outTypes, r.get(O.type), "Document Type", S, r.n);
    const recipientCategoryId = need(
      L.list("PARTY_CATEGORY"),
      r.get(O.recipientCategory),
      "Recipient Category",
      S,
      r.n,
    );
    const originatingUnitId = need(
      L.units,
      r.get(O.unit),
      "Originating Unit",
      S,
      r.n,
    );
    const dispatchModeId = need(
      L.list("RECEIPT_MODE"),
      r.get(O.dispatchMode),
      "Dispatch Mode",
      S,
      r.n,
    );
    if (report.errors.length > before) continue;

    const notes: string[] = [];
    const signedByText = text(r.get(O.signedBy));
    const signatoryId = signedByText
      ? (L.signatories.get(key(signedByText)) ?? null)
      : null;
    const dateDispatched = date(r.get(O.dateDispatched));
    const dispatchedById = dateDispatched
      ? officer(r.get(O.dispatchedBy), "Dispatched by", S, r.n, notes)
      : null;
    const replyNo = text(r.get(O.inReplyTo));
    let inReplyToInwardId: string | null = null;
    if (replyNo) {
      inReplyToInwardId =
        (
          await tx.inwardItem.findUnique({
            where: { number: replyNo },
            select: { id: true },
          })
        )?.id ?? null;
      if (!inReplyToInwardId)
        warn(
          S,
          r.n,
          `In Reply to ${replyNo} is not in the app; the link is left empty.`,
        );
    }

    const item = await createOutward(
      tx,
      {
        documentDate: documentDate!,
        typeId: typeId!,
        subject: subject!,
        addressee,
        recipientCategoryId: recipientCategoryId!,
        originatingUnitId: originatingUnitId!,
        signatoryId,
        signedByText: signatoryId ? null : signedByText,
        signatoryDesignation: text(r.get(O.designation)) ?? signedByText ?? "—",
        dispatchModeId: dispatchModeId!,
        recipientContact: text(r.get(O.contact)),
        inReplyToInwardId,
        relatedOgsercNo: text(r.get(O.related)),
        fileId: fileOf(r.get(O.fileRef), S, r.n),
        preparedBy: text(r.get(O.preparedBy)),
        dateDispatched,
        dispatchedById,
        trackingRef: text(r.get(O.trackingRef)),
        responseExpectedOverride: yesNo(r.get(O.responseExpected)),
        responseDueOverride: date(r.get(O.responseDueOverride)),
        remarks: withNotes(text(r.get(O.remarks)), notes),
        deliveryConfirmed: yesNo(r.get(O.deliveryConfirmed)),
        dateDelivered: date(r.get(O.dateDelivered)),
        receivedByRecipient: text(r.get(O.receivedByRecipient)),
      },
      actor,
      { preset: { number: no, year: parsed.year, serial: parsed.serial } },
    );
    imported.outward.push(item.id);
    report.outward.created++;
  }

  // ---- Inward "In Response to Our Ref.", now that outward items exist ---------
  for (const link of pendingResponseLinks) {
    const out = await tx.outwardItem.findUnique({
      where: { number: link.outwardNo },
      select: { id: true },
    });
    if (!out) {
      warn(
        SHEETS.inward,
        link.n,
        `In Response to ${link.outwardNo} is not in the app; the link is left empty.`,
      );
      continue;
    }
    await tx.inwardItem.update({
      where: { id: link.id },
      data: { inResponseToOutwardId: out.id },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "import",
        entityType: "InwardItem",
        entityId: link.id,
        before: { inResponseToOutwardId: null },
        after: { inResponseToOutwardId: out.id },
        note: "Link from the workbook",
      },
      actor.now,
    );
  }

  // ---- File Movement -------------------------------------------------------------
  const M = COLS.movements;
  for (const r of sheets.movements) {
    const ref = text(r.get(M.fileRef));
    const outAt = instant(r.get(M.outAt));
    if (!ref || !outAt) continue;
    if (isExample(r.get(M.purpose)) && !includeExamples) {
      report.movements.skippedExamples++;
      continue;
    }
    const S = SHEETS.movements;
    const fileId = fileIds.get(ref.replace(/\s+/g, "").toUpperCase());
    if (!fileId) {
      err(S, r.n, `File ${ref} is not in the File Index.`);
      continue;
    }
    const issuedTo = text(r.get(M.issuedTo));
    if (!issuedTo) {
      err(S, r.n, "Issued to is empty.");
      continue;
    }
    // Movements have no number: the same file, issued to the same person on
    // the same day, is the same movement (it may have been typed into both
    // the workbook and the app at slightly different times).
    const day = dateIn(outAt);
    const sameDay = await tx.fileMovement.findMany({
      where: {
        fileId,
        outAt: {
          gte: instantIn(day, "00:00"),
          lt: instantIn(addDays(day, 1), "00:00"),
        },
        issuedTo: { equals: issuedTo, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (sameDay.length) {
      report.movements.skippedExisting++;
      continue;
    }
    const before = report.errors.length;
    const unitId = need(L.units, r.get(M.unit), "Unit", S, r.n, false);
    if (report.errors.length > before) continue;
    const notes: string[] = [];
    const releasedById = officer(
      r.get(M.releasedBy),
      "Released by",
      S,
      r.n,
      notes,
    );
    const dateReturned = date(r.get(M.dateReturned));
    const receivedBackById = dateReturned
      ? officer(r.get(M.receivedBackBy), "Received back by", S, r.n, notes)
      : null;
    if (dateReturned && dateReturned < dateIn(outAt))
      warn(
        S,
        r.n,
        `Returned (${dateReturned}) before it went out; check the workbook.`,
      );
    const m = await tx.fileMovement.create({
      data: {
        fileId,
        outAt,
        volume: int(r.get(M.volume)),
        releasedById,
        issuedTo,
        unitId,
        purpose: withNotes(text(r.get(M.purpose)), notes),
        returnByOverride: toDbDate(date(r.get(M.returnBy))),
        dateReturned: toDbDate(dateReturned),
        receivedBackById,
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "import",
        entityType: "RegistryFile",
        entityId: fileId,
        after: m,
      },
      actor.now,
    );
    report.movements.created++;
  }

  // ---- Statuses now that every link is in place -----------------------------------
  for (const id of imported.inward) await refreshInward(tx, id, ctx);
  for (const id of imported.outward) await refreshOutward(tx, id, ctx);
}
