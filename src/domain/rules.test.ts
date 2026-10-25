// One test per rule in SPEC §3.1, §4.2–§4.4, §5.2–§5.4 and §6 that the §12
// scenario does not already reach.
import { describe, expect, it } from "vitest";
import {
  evaluate,
  incomingType,
  inwardRow,
  movement,
  outwardRow,
  workbookExample,
  type InwardRow,
  type OutwardRow,
} from "../../tests/fixtures/workbook-example";
import { instantIn } from "./clock";
import {
  deriveFile,
  deriveMovement,
  holderLabel,
  unreturnedMovement,
} from "./files";
import { INWARD_FLAGS as IF, reg01CacDuplicates } from "./inward";
import { formatNumber, parseNumber, slipFileName } from "./numbering";
import { OUTWARD_FLAGS as OF } from "./outward";
import { contextOn } from "../../tests/fixtures/workbook-example";

const TODAY = "2026-12-10";

function inward(p: Partial<InwardRow>, today = TODAY) {
  const row = inwardRow({
    id: "X",
    number: "OGSERC/ACK/2026/00009",
    receivedAt: instantIn("2026-12-01", "10:00"),
    modeId: "Hand delivery",
    type: incomingType("Other correspondence"),
    dateForwarded: "2026-12-01",
    ...p,
  });
  return evaluate({ inward: [row], outward: [], files: [] }, today).inward.get(
    "X",
  )!.derived;
}

function outward(
  p: Partial<OutwardRow> & { typeName?: string },
  today = TODAY,
) {
  const row = outwardRow({
    id: "Y",
    number: "OGSERC/OUT/2026/00009",
    typeName: "Letter (general)",
    documentDate: "2026-12-01",
    dispatchModeId: "Courier",
    ...p,
  });
  return evaluate({ inward: [], outward: [row], files: [] }, today).outward.get(
    "Y",
  )!.derived;
}

describe("numbering (SPEC §3.1)", () => {
  it("formats and parses five-digit serials", () => {
    expect(formatNumber("OGSERC/ACK", 2026, 1)).toBe("OGSERC/ACK/2026/00001");
    expect(formatNumber("OGSERC/OUT", 2027, 123456)).toBe(
      "OGSERC/OUT/2027/123456",
    );
    expect(parseNumber("OGSERC/ACK/2026/00042")).toEqual({
      prefix: "OGSERC/ACK",
      year: 2026,
      serial: 42,
    });
    expect(parseNumber("ACK/2026/1")).toBeNull();
    expect(() => formatNumber("OGSERC/ACK", 2026, 0)).toThrow();
  });

  it("names the slip file without slashes", () => {
    expect(slipFileName("OGSERC/ACK/2026/00001")).toBe(
      "Slip OGSERC-ACK-2026-00001.pdf",
    );
  });
});

describe("inward response due (SPEC §4.2)", () => {
  it("uses the override first", () => {
    expect(inward({ responseDueOverride: "2026-12-04" }).responseDue).toBe(
      "2026-12-04",
    );
  });

  it("has no due date for For information / File only", () => {
    const d = inward({ actionRequired: "FOR_INFORMATION" });
    expect(d.responseDue).toBeNull();
    expect(d.status).toBe("Noted / filed");
    expect(d.pending).toBe(false);
    expect(inward({ actionRequired: "FILE_ONLY" }).responseDue).toBeNull();
  });

  it("gives Urgent items one working day", () => {
    expect(inward({ priority: "URGENT" }).responseDue).toBe("2026-12-02");
  });

  it("has no due date when the type's target is 0", () => {
    const d = inward({
      type: incomingType("Circular / publication (for information)"),
    });
    expect(d.responseDue).toBeNull();
  });

  it("falls back to the default target when the type is missing", () => {
    const d = inward({ type: null });
    expect(d.targetDays).toBe(10);
    expect(d.responseDue).toBe("2026-12-15");
    expect(d.flags).toContain(IF.missingRequired);
  });
});

describe("inward status order (SPEC §4.3)", () => {
  it("Void beats everything and carries no flags", () => {
    const d = inward({
      voided: true,
      dateClosedManual: "2026-12-02",
      ackIssuedVia: "NOT_YET_ISSUED",
    });
    expect(d.status).toBe("Void");
    expect(d.flags).toEqual([]);
    expect(d.pending).toBe(false);
  });

  it("Closed beats Overdue; a manual close wins over a reply", () => {
    const d = inward({ dateClosedManual: "2026-12-20" }, "2026-12-31");
    expect(d.status).toBe("Closed");
    expect(d.closedOnTime).toBe(false);
    expect(d.flags).toContain(IF.closedLate);
  });

  it("Overdue beats Awaiting forwarding", () => {
    expect(inward({ dateForwarded: null }, "2026-12-16").status).toBe(
      "Overdue",
    );
  });

  it("Open when forwarded and not due", () => {
    expect(inward({}).status).toBe("Open");
    expect(inward({}).pending).toBe(true);
  });

  it("ignores a closing reply that has not been dispatched or was voided", () => {
    const s = workbookExample();
    s.outward[0].dateDispatched = null;
    expect(evaluate(s, TODAY).inward.get("I1")!.derived.status).toBe("Open");
    s.outward[0].dateDispatched = "2026-11-25";
    s.outward[0].voided = true;
    expect(evaluate(s, TODAY).inward.get("I1")!.derived.status).toBe("Open");
  });
});

describe("inward flags (SPEC §4.4)", () => {
  const reg = incomingType("REG-01 Registration (new)");

  it("flags a REG-01 without fee evidence or with fewer than 12 documents", () => {
    const d = inward({
      type: reg,
      feeEvidenceAttached: false,
      schedule2DocsAttached: 11,
    });
    expect(d.flags).toEqual([IF.noFee, IF.schedule2Incomplete]);
  });

  it("asks for 13 documents when the multi-State box is ticked", () => {
    const base = {
      type: reg,
      feeEvidenceAttached: true,
      schedule2DocsAttached: 12,
    };
    expect(inward(base).flags).toEqual([]);
    expect(inward({ ...base, multiState: true }).flags).toEqual([
      IF.schedule2MultiState,
    ]);
    expect(
      inward({ ...base, multiState: true, schedule2DocsAttached: 13 }).flags,
    ).toEqual([]);
  });

  it("does not apply REG-01 checks to other types", () => {
    expect(
      inward({ feeEvidenceAttached: false, schedule2DocsAttached: 0 }).flags,
    ).toEqual([]);
  });

  it("finds duplicate REG-01 CAC numbers among non-void items, ignoring case", () => {
    const ids = reg01CacDuplicates([
      { id: "a", isRegistration: true, cacNo: "RC123", voided: false },
      { id: "b", isRegistration: true, cacNo: " rc123 ", voided: false },
      { id: "c", isRegistration: true, cacNo: "RC123", voided: true },
      { id: "d", isRegistration: false, cacNo: "RC123", voided: false },
      { id: "e", isRegistration: true, cacNo: "RC999", voided: false },
      { id: "f", isRegistration: true, cacNo: "", voided: false },
      { id: "g", isRegistration: true, cacNo: "", voided: false },
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("flags the duplicate on both REG-01 items", () => {
    const s = workbookExample();
    s.inward.push({
      ...s.inward[0],
      id: "I9",
      number: "OGSERC/ACK/2026/00009",
    });
    const r = evaluate(s, TODAY);
    expect(r.inward.get("I1")!.derived.flags).toContain(IF.duplicateCac);
    expect(r.inward.get("I9")!.derived.flags).toContain(IF.duplicateCac);
  });

  it("flags a missing related OGSERC number for updates, confirmations and deficiency responses", () => {
    for (const t of [
      "Update - material change",
      "Annual confirmation",
      "Deficiency response",
    ])
      expect(inward({ type: incomingType(t) }).flags).toEqual([
        IF.relatedNoMissing,
      ]);
    expect(
      inward({
        type: incomingType("Annual confirmation"),
        relatedOgsercNo: "REG/1",
      }).flags,
    ).toEqual([]);
  });

  it("flags forwarding only after more than 2 working days", () => {
    const at = (today: string) => inward({ dateForwarded: null }, today);
    expect(at("2026-12-03").flags).toEqual([]); // 2 days
    expect(at("2026-12-04").flags).toEqual([IF.notForwarded]); // 3 days
  });

  it("flags an acknowledgement not yet issued", () => {
    expect(inward({ ackIssuedVia: "NOT_YET_ISSUED" }).flags).toEqual([
      IF.ackNotIssued,
    ]);
  });

  it("flags a number whose year differs from the deemed receipt year", () => {
    const d = inward({
      numberYear: 2026,
      receivedAt: instantIn("2026-12-31", "17:30"),
      modeId: "Email",
    });
    expect(d.deemedReceiptDate).toBe("2027-01-04");
    expect(d.flags).toContain(IF.numberYearDiffers);
  });
});

describe("registration deadline on REG-01 (SPEC §2.2, §4.2)", () => {
  const reg = {
    type: incomingType("REG-01 Registration (new)"),
    feeEvidenceAttached: true,
    schedule2DocsAttached: 12,
  };

  it("is filed after the deadline when deemed after 1 Jan 2027", () => {
    const late = { ...reg, receivedAt: instantIn("2027-01-04", "09:00") };
    expect(inward(late, "2027-01-05").filedAfterRegistrationDeadline).toBe(
      true,
    );
    expect(inward(reg).filedAfterRegistrationDeadline).toBe(false);
  });

  it("honours a para 25 extension on the item", () => {
    const late = {
      ...reg,
      receivedAt: instantIn("2027-01-04", "09:00"),
      registrationDeadlineOverride: "2027-01-31",
    };
    expect(inward(late, "2027-01-05").filedAfterRegistrationDeadline).toBe(
      false,
    );
  });
});

describe("outward (SPEC §5.2–§5.4)", () => {
  it("is Not yet dispatched, flagged after more than 2 working days", () => {
    expect(outward({}, "2026-12-03")).toMatchObject({
      status: "Not yet dispatched",
      flags: [],
    });
    expect(outward({}, "2026-12-04").flags).toEqual([OF.notDispatched]);
  });

  it("ignores the response-due override until dispatched (Excel)", () => {
    expect(
      outward({ responseDueOverride: "2026-12-05" }).responseDue,
    ).toBeNull();
    expect(
      outward({
        responseDueOverride: "2026-12-05",
        dateDispatched: "2026-12-01",
      }).responseDue,
    ).toBe("2026-12-05");
  });

  it("uses the default window when a response is expected but the type has none", () => {
    const d = outward({
      responseExpectedOverride: true,
      dateDispatched: "2026-12-01",
    });
    expect(d).toMatchObject({
      responseExpected: true,
      responseDue: "2026-12-15",
      status: "Awaiting response",
    });
  });

  it("can switch an expected response off", () => {
    const d = outward({
      typeName: "Deficiency notice",
      responseExpectedOverride: false,
      dateDispatched: "2026-12-01",
      deliveryConfirmed: true,
    });
    expect(d).toMatchObject({ responseDue: null, status: "Delivered" });
  });

  it("goes Response overdue after the due date", () => {
    const d = outward({
      typeName: "Deficiency notice",
      dateDispatched: "2026-11-25",
    });
    expect(d.status).toBe("Response overdue");
    expect(d.flags).toContain(OF.responseOverdue);
  });

  it("never chases delivery for gazette or internal mail", () => {
    for (const mode of ["Publication / gazette", "Internal mail"])
      expect(
        outward({ dispatchModeId: mode, dateDispatched: "2026-12-01" }).flags,
      ).toEqual([]);
    expect(outward({ dateDispatched: "2026-12-01" }).flags).toEqual([
      OF.deliveryNotConfirmed,
    ]);
  });

  it("flags dispatch before the document date", () => {
    expect(outward({ dateDispatched: "2026-11-30" }).flags).toContain(
      OF.dispatchedBeforeDocument,
    );
  });

  it("ignores voided responses and is Void when voided", () => {
    const s = workbookExample();
    s.inward[1].voided = true;
    expect(evaluate(s, TODAY).outward.get("O1")!.derived.status).toBe(
      "Response overdue",
    );
    s.outward[0].voided = true;
    expect(evaluate(s, TODAY).outward.get("O1")!.derived).toMatchObject({
      status: "Void",
      flags: [],
    });
  });
});

describe("files and movements (SPEC §6)", () => {
  const ctx = contextOn(TODAY);

  it("uses the return-by override and stays Out until it passes", () => {
    const m = movement({
      id: "m",
      outAt: instantIn("2026-12-02", "09:00"),
      issuedTo: "Legal Adviser",
      unitName: null,
      returnByOverride: "2026-12-11",
    });
    expect(deriveMovement(m, ctx)).toMatchObject({
      returnDue: "2026-12-11",
      status: "Out",
      holder: "Legal Adviser",
    });
  });

  it("flags a movement issued while the file was still out", () => {
    const m = movement({
      id: "m",
      outAt: instantIn("2026-12-02", "09:00"),
      issuedTo: "A",
      unitName: "Legal",
      issuedWhileOut: true,
    });
    expect(deriveMovement(m, ctx).flags).toEqual([
      "Earlier movement of this file not returned",
    ]);
  });

  it("returns the latest unreturned movement for Record return", () => {
    const a = movement({
      id: "a",
      outAt: instantIn("2026-12-01", "09:00"),
      issuedTo: "A",
      unitName: null,
    });
    const b = movement({
      id: "b",
      outAt: instantIn("2026-12-03", "09:00"),
      issuedTo: "B",
      unitName: null,
    });
    const c = movement({
      id: "c",
      outAt: instantIn("2026-12-04", "09:00"),
      issuedTo: "C",
      unitName: null,
      dateReturned: "2026-12-04",
    });
    expect(unreturnedMovement([a, b, c])?.id).toBe("b");
    expect(unreturnedMovement([c])).toBeNull();
    expect(holderLabel({ issuedTo: "B", unitName: "Legal" })).toBe("B (Legal)");
  });

  it("flags correspondence after the file was closed, ignoring voided items", () => {
    const facts = {
      reference: "OGSERC/X/001",
      fileStatus: "CLOSED" as const,
      dateClosedOrArchived: "2026-11-30",
      inward: [
        { deemedReceiptDate: "2026-12-01", voided: true },
        { deemedReceiptDate: "2026-11-20", voided: false },
      ],
      outward: [{ documentDate: "2026-11-25", voided: false }],
      movements: [],
    };
    expect(deriveFile(facts, ctx)).toMatchObject({
      inwardCount: 1,
      lastCorrespondence: "2026-11-25",
      currentlyWith: "Registry",
      flags: [],
    });
    facts.outward.push({ documentDate: "2026-12-02", voided: false });
    expect(deriveFile(facts, ctx).flags).toEqual([
      "Correspondence after file closed",
    ]);
  });
});

describe("dashboard (SPEC §8.4)", () => {
  it("excludes voided items from every count except voided", () => {
    const s = workbookExample();
    s.inward[1].voided = true;
    const { incoming } = evaluate(s, TODAY).dashboard;
    expect(incoming).toMatchObject({
      logged: 2,
      voided: 1,
      awaitingForwarding: 0,
      afterHoursOrNonWorkingDay: 0,
    });
  });

  it("counts received in the last 7 days as (today − 7, today]", () => {
    const last7 = (today: string) =>
      evaluate(workbookExample(), today).dashboard.incoming.receivedLast7Days;
    expect(last7("2026-12-06")).toBe(2); // 30 Nov and 2 Dec
    expect(last7("2026-12-07")).toBe(1); // 30 Nov is today − 7: excluded
  });
});
