// SPEC §12.2 (workbook example, "today" = 10 Dec 2026 unless stated) and the
// pure parts of §12.3 (N1, N2). N3 and N4 need the database (Phase 2).
import { describe, expect, it } from "vitest";
import { instantIn } from "./clock";
import { deriveMovement } from "./files";
import { INWARD_FLAGS } from "./inward";
import { OUTWARD_FLAGS } from "./outward";
import {
  contextOn,
  evaluate,
  inwardRow,
  outwardRow,
  workbookExample,
} from "../../tests/fixtures/workbook-example";

const TODAY = "2026-12-10";
const base = () => evaluate(workbookExample(), TODAY);
const get = <T>(m: Map<string, T>, k: string) => {
  const v = m.get(k);
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

describe("§12.2 inward", () => {
  it("I1: REG-01 closed on time by O1", () => {
    const { derived: d } = get(base().inward, "I1");
    expect(d).toMatchObject({
      deemedReceiptDate: "2026-11-20",
      category: "Regulatory filing",
      orderRef: "11; Sch. 1 Pt A",
      routedUnitId: "Registration & Licensing",
      responseDue: "2026-12-18",
      closedOn: "2026-11-25",
      status: "Closed",
      closedOnTime: true,
      filedAfterRegistrationDeadline: false,
      workingDaysOpen: 3,
      flags: [],
    });
    expect(d.replyOutward?.id).toBe("O1");
  });

  it("I2: deficiency response by email after hours, not forwarded", () => {
    const { derived: d } = get(base().inward, "I2");
    expect(d).toMatchObject({
      deemedReceiptDate: "2026-12-01",
      responseDue: "2026-12-15",
      status: "Awaiting forwarding",
      workingDaysAtRegistry: 7,
      flags: [INWARD_FLAGS.notForwarded],
      afterHoursOrNonWorkingDay: true,
      filedAfterRegistrationDeadline: null,
    });
  });

  it("I2 on 16 Dec 2026: Overdue, with Response overdue", () => {
    const { derived: d } = get(
      evaluate(workbookExample(), "2026-12-16").inward,
      "I2",
    );
    expect(d.status).toBe("Overdue");
    expect(d.flags).toEqual([
      INWARD_FLAGS.notForwarded,
      INWARD_FLAGS.responseOverdue,
    ]);
  });

  it("I3: NERC letter routed to the Chairman, closed on time by O2", () => {
    const { derived: d } = get(base().inward, "I3");
    expect(d).toMatchObject({
      routedUnitId: "Office of the Chairman",
      responseDue: "2026-12-16",
      closedOn: "2026-12-03",
      status: "Closed",
      closedOnTime: true,
      flags: [],
    });
    expect(d.replyOutward?.id).toBe("O2");
  });
});

describe("§12.2 outward", () => {
  it("O1: deficiency notice, response received from I2", () => {
    const { derived: d } = get(base().outward, "O1");
    expect(d).toMatchObject({
      responseExpected: true,
      responseDue: "2026-12-09",
      responseReceivedOn: "2026-12-01",
      status: "Response received",
      flags: [],
    });
    expect(d.responseInward?.id).toBe("I2");
  });

  it("O2: letter to NERC, dispatched, no flag on 10 Dec", () => {
    const { derived: d } = get(base().outward, "O2");
    expect(d).toMatchObject({
      responseExpected: false,
      responseDue: null,
      workingDaysToDispatch: 1,
      workingDaysSinceDispatch: 5,
      status: "Dispatched",
      flags: [],
    });
  });

  it("O2 on 11 Dec 2026: Delivery not confirmed", () => {
    const { derived: d } = get(
      evaluate(workbookExample(), "2026-12-11").outward,
      "O2",
    );
    expect(d.flags).toEqual([OUTWARD_FLAGS.deliveryNotConfirmed]);
  });
});

describe("§12.2 files", () => {
  it("F1: M1 returned on its due date; file is back with the Registry", () => {
    const s = base();
    const f1 = get(s.files, "OGSERC/RL/001");
    const m1 = deriveMovement(f1.facts.movements[0], s.ctx);
    expect(m1).toMatchObject({
      returnDue: "2026-11-25",
      workingDaysOut: 3,
      status: "Returned",
    });
    expect(f1.derived).toMatchObject({
      inwardCount: 2,
      outwardCount: 1,
      lastCorrespondence: "2026-12-01",
      currentlyWith: "Registry",
      isOut: false,
      flags: [],
    });
  });

  it("F2: M2 overdue with the PA to Chairman", () => {
    const s = base();
    const f2 = get(s.files, "OGSERC/GOV/001");
    const m2 = deriveMovement(f2.facts.movements[0], s.ctx);
    expect(m2).toMatchObject({
      returnDue: "2026-12-07",
      workingDaysOut: 6,
      status: "Overdue",
    });
    expect(f2.derived).toMatchObject({
      currentlyWith: "PA to Chairman (Office of the Chairman)",
      outSince: "2026-12-02",
      workingDaysOut: 6,
      flags: ["Out beyond return date"],
    });
  });
});

describe("§12.2 dashboard on 10 Dec 2026", () => {
  it("matches the workbook counts", () => {
    const { incoming, outgoing, files } = base().dashboard;
    expect(incoming).toMatchObject({
      logged: 3,
      awaitingForwarding: 1,
      closed: 2,
      closedOnTimePct: 100,
      afterHoursOrNonWorkingDay: 1,
      pending: 1,
    });
    expect(outgoing).toMatchObject({
      logged: 2,
      responsesReceived: 1,
      repliesToInward: 2,
    });
    expect(files).toMatchObject({ outWithOfficers: 1, overdue: 1 });
  });
});

describe("§12.3 new rules", () => {
  it("N1 (R4): a holding reply leaves I2 open; a real reply closes it", () => {
    const s = workbookExample();
    s.outward.push(
      outwardRow({
        id: "O3",
        number: "OGSERC/OUT/2026/00003",
        typeName: "Acknowledgement / holding reply",
        documentDate: "2026-12-02",
        inReplyToInwardId: "I2",
        dispatchModeId: "Email",
        dateDispatched: "2026-12-02",
      }),
    );
    let i2 = get(evaluate(s, "2026-12-07").inward, "I2").derived;
    expect(i2.closedOn).toBeNull();
    expect(i2.status).toBe("Awaiting forwarding");
    expect(i2.replies.map((r) => r.id)).toEqual(["O3"]);

    s.outward.push(
      outwardRow({
        id: "O4",
        number: "OGSERC/OUT/2026/00004",
        typeName: "Reply to correspondence",
        documentDate: "2026-12-08",
        inReplyToInwardId: "I2",
        dispatchModeId: "Email",
        dateDispatched: "2026-12-08",
      }),
    );
    i2 = get(evaluate(s, TODAY).inward, "I2").derived;
    expect(i2).toMatchObject({ status: "Closed", closedOn: "2026-12-08" });
    expect(i2.replyOutward?.id).toBe("O4");
    expect(i2.replies.map((r) => r.id)).toEqual(["O3", "O4"]);
  });

  it("N2 (R3): two responses to O1 — the earliest counts, both listed", () => {
    const s = workbookExample();
    s.inward.push(
      inwardRow({
        id: "I4",
        number: "OGSERC/ACK/2026/00004",
        receivedAt: instantIn("2026-12-03", "10:00"),
        modeId: "Hand delivery",
        type: s.inward[1].type,
        relatedOgsercNo: "ACK/2026/00001",
        inResponseToOutwardId: "O1",
      }),
    );
    const o1 = get(evaluate(s, TODAY).outward, "O1").derived;
    expect(o1.responseReceivedOn).toBe("2026-12-01");
    expect(o1.responseInward?.id).toBe("I2");
    expect(o1.responses.map((r) => [r.id, r.deemedReceiptDate])).toEqual([
      ["I2", "2026-12-01"],
      ["I4", "2026-12-03"],
    ]);
  });

  it("contextOn keeps the seeded rules", () => {
    expect(contextOn(TODAY).rules.officeClosingTime).toBe("17:00");
  });
});
