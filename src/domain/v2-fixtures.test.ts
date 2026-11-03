// SPEC-v2 C13.2: the new behaviour, as far as it is pure domain logic
// ("today" = 10 Dec 2026 unless stated). The server, permission and database
// parts (V1, V6 save, V10 refusal, V12 recording, V13 seed) are covered by
// integration tests in later phases.
import { describe, expect, it } from "vitest";
import seed from "../../seed-data.json";
import {
  composeAckEmail,
  mergeAddresses,
  noAddressLine,
  planAckEmail,
  resendPrompt,
  resolveRecipients,
} from "./ack-email";
import { instantIn } from "./clock";
import {
  fileAlreadyInIndex,
  fileReferenceTaken,
  issueUnitProblem,
  missingFileClassCode,
  nextFileReference,
} from "./file-refs";
import {
  deriveIntake,
  intakeAlreadyRegistered,
  intakeLoggedMessage,
  pullIntakeValues,
  receiptChangedFromIntake,
} from "./front-desk";
import {
  INWARD_FLAGS,
  isAwaitingRoutingOrForwarding,
  PENDING_INWARD,
  savedInwardMessage,
} from "./inward";
import { formatNumber, inwardNumberYear, intakeNumberYear } from "./numbering";
import { defaultSignatory, signatoryDesignation } from "./outward";
import { deemedReceiptDate } from "./receipt";
import {
  forwardBeforeRoutingPrompt,
  missingRoutingFields,
  needsForwardBeforeRoutingConfirm,
  ROUTING_REFUSED,
  routedMessage,
  routingBlocker,
  routingChanges,
  type RoutingFields,
} from "./routing";
import {
  contextOn,
  evaluate,
  workbookExample,
  type InwardRow,
} from "../../tests/fixtures/workbook-example";
import { seedHolidays, seedRules } from "../../tests/fixtures/rules";

const TODAY = "2026-12-10";
const LAGOS = "Africa/Lagos";
const unitEmails = (name: string) =>
  seed.units.find((u) => u.name === name)!.emails;
const divisionEmails = (unit: string) => {
  const div = seed.units.find((u) => u.name === unit)!.division;
  return seed.divisions.find((d) => d.name === div)!.emails;
};
const recipients = (unit: string) =>
  resolveRecipients({
    unitEmails: unitEmails(unit),
    divisionEmails: divisionEmails(unit),
    cc: "",
  });

/** The example with I2 changed by `edit`. */
function withI2(edit: Partial<InwardRow>) {
  const s = workbookExample();
  Object.assign(s.inward[1], edit);
  return evaluate(s, TODAY).inward.get("I2")!;
}

describe("inward status cascade and pending (C5.3)", () => {
  it("pending includes Awaiting routing; Awaiting routing / forwarding is both", () => {
    expect(PENDING_INWARD).toEqual([
      "Open",
      "Overdue",
      "Awaiting forwarding",
      "Awaiting routing",
    ]);
    expect(isAwaitingRoutingOrForwarding("Awaiting routing")).toBe(true);
    expect(isAwaitingRoutingOrForwarding("Awaiting forwarding")).toBe(true);
    expect(isAwaitingRoutingOrForwarding("Open")).toBe(false);
  });

  it("Overdue still comes before Awaiting routing (I2 on 16 Dec)", () => {
    const i2 = evaluate(workbookExample(), "2026-12-16").inward.get("I2")!;
    expect(i2.derived.status).toBe("Overdue");
  });

  it("a routed item forwarded with For information is Noted / filed", () => {
    const { derived } = withI2({
      routed: true,
      actionRequired: "FOR_INFORMATION",
      dateForwarded: "2026-12-02",
    });
    expect(derived.status).toBe("Noted / filed");
    expect(derived.responseDue).toBeNull();
  });
});

describe("V1 and V5: who may route, and what", () => {
  it("V1: the refusal message", () => {
    expect(ROUTING_REFUSED).toBe(
      "Only the Secretary to the Commission and the Head of Administration can route items.",
    );
  });

  it("V5: a Closed item (I1) or a Void item cannot be routed; an Overdue one can", () => {
    expect(
      routingBlocker({ number: "OGSERC/ACK/2026/00001", status: "Closed" }),
    ).toBe("OGSERC/ACK/2026/00001 is closed and cannot be routed.");
    expect(routingBlocker({ number: "X", status: "Void" })).toBe(
      "X is void and cannot be routed.",
    );
    expect(routingBlocker({ number: "X", status: "Overdue" })).toBeNull();
    expect(
      routingBlocker({ number: "X", status: "Awaiting routing" }),
    ).toBeNull();
  });

  it("routing requires an action", () => {
    const f: RoutingFields = {
      unitOverrideId: null,
      fileId: null,
      actionRequired: null,
      priority: null,
      actionOfficer: null,
      responseDueOverride: null,
    };
    expect(missingRoutingFields(f)).toEqual(["Action required"]);
    expect(
      missingRoutingFields({ ...f, actionRequired: "ACTION_REQUIRED" }),
    ).toEqual([]);
  });
});

describe("V2 and V3: routing I2 and the routing email", () => {
  it("V2: Secretary routes I2 (unit unchanged, Action required) → Awaiting forwarding", () => {
    const { derived } = withI2({
      routed: true,
      actionRequired: "ACTION_REQUIRED",
    });
    expect(derived.status).toBe("Awaiting forwarding");
    expect(derived.routedUnitId).toBe("Licensing unit");
    expect(derived.responseDue).toBe("2026-12-15");
    expect(
      routedMessage(
        "OGSERC/ACK/2026/00002",
        "Licensing unit",
        "Oluwatoyin Sonoiki",
        derived.status,
      ),
    ).toBe(
      "OGSERC/ACK/2026/00002 routed to Licensing unit by Oluwatoyin Sonoiki.\nStatus: Awaiting forwarding",
    );
  });

  it("V2: no address for Licensing unit or its division → nothing sent, and the message says so", () => {
    const r = recipients("Licensing unit");
    expect(r.to).toEqual([]);
    const plan = planAckEmail({
      mode: "SEND",
      kind: "routing",
      unit: "Licensing unit",
      ...r,
      emailedTo: [],
      pendingReview: [],
    });
    expect(plan).toEqual({
      action: "none",
      line: noAddressLine("Licensing unit"),
    });
    expect(noAddressLine("Licensing unit")).toContain(
      "Acknowledgement not emailed: no email address is set for 'Licensing unit' or its division",
    );
  });

  it("V2: once addresses exist, routing to the unit already emailed at save sends nothing", () => {
    expect(
      planAckEmail({
        mode: "SEND",
        kind: "routing",
        unit: "Licensing unit",
        to: ["licensing@ogserc.org.ng"],
        cc: [],
        emailedTo: ["Licensing@OGSERC.org.ng"],
        pendingReview: [],
      }),
    ).toEqual({ action: "none", line: null });
  });

  it("V3: re-route to ICT unit → email to it@ogserc.org.ng (its division has none); again → nothing", () => {
    const r = recipients("ICT unit");
    expect(r.to).toEqual(["it@ogserc.org.ng"]);
    const first = planAckEmail({
      mode: "SEND",
      kind: "routing",
      unit: "ICT unit",
      ...r,
      emailedTo: [],
      pendingReview: [],
    });
    expect(first).toEqual({
      action: "send",
      to: ["it@ogserc.org.ng"],
      cc: [],
      supersede: [],
    });
    const emailedTo = mergeAddresses([], r.to);
    expect(
      planAckEmail({
        mode: "SEND",
        kind: "routing",
        unit: "ICT unit",
        ...r,
        emailedTo,
        pendingReview: [],
      }),
    ).toEqual({ action: "none", line: null });
  });

  it("V3: routing history records the changed fields only", () => {
    const before: RoutingFields = {
      unitOverrideId: null,
      fileId: "F1",
      actionRequired: "ACTION_REQUIRED",
      priority: null,
      actionOfficer: null,
      responseDueOverride: null,
    };
    expect(
      routingChanges(before, { ...before, unitOverrideId: "ICT unit" }),
    ).toEqual({
      before: { unitOverrideId: null },
      after: { unitOverrideId: "ICT unit" },
    });
    expect(routingChanges(before, { ...before })).toEqual({
      before: {},
      after: {},
    });
  });

  it("the full resolved list goes out when routing adds a division address (agreed C6 a)", () => {
    expect(
      planAckEmail({
        mode: "SEND",
        kind: "routing",
        unit: "Engineering Standards unit",
        to: ["es@ogserc.org.ng", "engineeringstandards@ogserc.org.ng"],
        cc: [],
        emailedTo: ["es@ogserc.org.ng"],
        pendingReview: [],
      }),
    ).toMatchObject({
      action: "send",
      to: ["es@ogserc.org.ng", "engineeringstandards@ogserc.org.ng"],
    });
  });

  it("Engineering Services units get the division address", () => {
    expect(recipients("Engineering Standards unit").to).toEqual([
      "engineeringstandards@ogserc.org.ng",
    ]);
  });
});

describe("V4: forwarding before routing (C5.4)", () => {
  it("asks for confirmation only when the item is unrouted and not yet forwarded", () => {
    const base = {
      routed: false,
      dateForwarded: null,
      settingForwarded: TODAY,
    };
    expect(needsForwardBeforeRoutingConfirm(base)).toBe(true);
    expect(needsForwardBeforeRoutingConfirm({ ...base, routed: true })).toBe(
      false,
    );
    expect(
      needsForwardBeforeRoutingConfirm({
        ...base,
        dateForwarded: "2026-12-02",
      }),
    ).toBe(false);
    expect(
      needsForwardBeforeRoutingConfirm({ ...base, settingForwarded: null }),
    ).toBe(false);
    expect(forwardBeforeRoutingPrompt("OGSERC/ACK/2026/00002")).toBe(
      "OGSERC/ACK/2026/00002 has not been routed by the Secretary / Head of Admin yet. Forward it anyway?",
    );
  });

  it("after confirming: Awaiting routing no more, flag 'Forwarded before routing'", () => {
    const { derived } = withI2({
      dateForwarded: TODAY,
      forwardedBeforeRouting: true,
    });
    expect(derived.status).toBe("Open");
    expect(derived.flags).toContain(INWARD_FLAGS.forwardedBeforeRouting);
    expect(derived.flags).not.toContain(INWARD_FLAGS.notForwarded);
  });
});

describe("V6–V8: front desk intakes (C3)", () => {
  const ctx = contextOn(TODAY);
  const fri = instantIn("2026-12-04", "16:30");

  it("V6: Fri 4 Dec 16:30 → OGSERC/FD/2026/00001, Awaiting registry, 4 working days on 10 Dec", () => {
    expect(formatNumber("OGSERC/FD", intakeNumberYear(fri, LAGOS), 1)).toBe(
      "OGSERC/FD/2026/00001",
    );
    expect(
      deriveIntake(
        {
          intakeNo: "OGSERC/FD/2026/00001",
          receivedAt: fri,
          inwardItemId: null,
          registeredAt: null,
        },
        ctx,
      ),
    ).toEqual({
      status: "Awaiting registry",
      receiptDate: "2026-12-04",
      workingDaysWaiting: 4,
    });
    expect(intakeLoggedMessage("OGSERC/FD/2026/00001")).toBe(
      "Logged as OGSERC/FD/2026/00001. No acknowledgement has been issued. Pass the document to the Registry - it stays on the 'Awaiting registry' list until the Registry registers it.",
    );
  });

  it("V6: registered on 10 Dec keeps the front desk time: deemed 4 Dec; waiting stays 4", () => {
    expect(
      deemedReceiptDate(fri, "Hand delivery", seedRules, seedHolidays),
    ).toBe("2026-12-04");
    const reg = deriveIntake(
      {
        intakeNo: "OGSERC/FD/2026/00001",
        receivedAt: fri,
        inwardItemId: "I4",
        registeredAt: instantIn(TODAY, "09:30"),
      },
      contextOn("2026-12-20"),
    );
    expect(reg).toMatchObject({ status: "Registered", workingDaysWaiting: 4 });
    expect(
      intakeAlreadyRegistered("OGSERC/FD/2026/00001", "OGSERC/ACK/2026/00004"),
    ).toBe(
      "OGSERC/FD/2026/00001 is already registered as OGSERC/ACK/2026/00004.",
    );
  });

  it("V7: intake 24 Dec 2026, registered 29 Dec → 1 working day", () => {
    expect(
      deriveIntake(
        {
          intakeNo: "x",
          receivedAt: instantIn("2026-12-24", "10:00"),
          inwardItemId: "y",
          registeredAt: instantIn("2026-12-29", "10:00"),
        },
        contextOn("2027-01-10"),
      ).workingDaysWaiting,
    ).toBe(1);
  });

  it("V8: 31 Dec 2026 23:00 → FD series 2026, but an email inward then is deemed 4 Jan 2027 (ACK 2027)", () => {
    const late = instantIn("2026-12-31", "23:00");
    expect(intakeNumberYear(late, LAGOS)).toBe(2026);
    const deemed = deemedReceiptDate(late, "Email", seedRules, seedHolidays);
    expect(deemed).toBe("2027-01-04");
    expect(inwardNumberYear(deemed)).toBe(2027);
  });

  it("pull: only non-blank values; changing time or mode needs a reason", () => {
    expect(
      pullIntakeValues({
        receivedAt: fri,
        modeId: "Hand delivery",
        typeId: null,
        sender: "Verge",
        subject: "  ",
        phone: null,
        deliveredBy: "Courier man",
        volumes: 0,
        remarks: "",
      }),
    ).toEqual({
      receivedAt: fri,
      modeId: "Hand delivery",
      sender: "Verge",
      deliveredBy: "Courier man",
      volumes: 0,
    });
    const intake = { receivedAt: fri, modeId: "Hand delivery" };
    expect(receiptChangedFromIntake(intake, { ...intake })).toEqual([]);
    expect(
      receiptChangedFromIntake(intake, {
        receivedAt: instantIn("2026-12-04", "17:30"),
        modeId: "Email",
      }),
    ).toEqual(["receivedAt", "modeId"]);
  });
});

describe("V9 and V10: Internal File Desk (C8)", () => {
  const existing = ["OGSERC/RL/001", "OGSERC/GOV/001"];

  it("V9: Licensee file with RL/001 → OGSERC/RL/002; Policy & regulations with none → OGSERC/POL/001", () => {
    expect(nextFileReference("OGSERC", "RL", existing, 3)).toBe(
      "OGSERC/RL/002",
    );
    expect(nextFileReference("OGSERC", "POL", existing, 3)).toBe(
      "OGSERC/POL/001",
    );
  });

  it("V9: case-insensitive match for both the serial and uniqueness", () => {
    expect(
      nextFileReference("OGSERC", "RL", ["ogserc/rl/007", "OGSERC/RL/002"], 3),
    ).toBe("OGSERC/RL/008");
    expect(fileReferenceTaken("ogserc/rl/002", ["OGSERC/RL/002"])).toBe(true);
    expect(fileReferenceTaken("OGSERC/RL/003", ["OGSERC/RL/002"])).toBe(false);
    expect(fileAlreadyInIndex("ogserc/rl/002")).toBe(
      "ogserc/rl/002 is already in the File Index.",
    );
  });

  it("does not confuse codes that share a start, and grows past 999", () => {
    expect(nextFileReference("OGSERC", "RL", ["OGSERC/RLX/050"], 3)).toBe(
      "OGSERC/RL/001",
    );
    expect(nextFileReference("OGSERC", "GEN", ["OGSERC/GEN/999"], 3)).toBe(
      "OGSERC/GEN/1000",
    );
  });

  it("missing class code message", () => {
    expect(missingFileClassCode("New class")).toBe(
      "Set a file class code for 'New class' in Admin, or type the file reference.",
    );
  });

  it("V10: issuing a file needs a unit from the unit list", () => {
    const units = new Set(["u1", "u2"]);
    expect(issueUnitProblem("u1", units)).toBeNull();
    expect(issueUnitProblem("PA's office", units)).toBe(
      "Choose the unit from the list of OGSERC units.",
    );
    expect(issueUnitProblem(null, units)).toBe("Please complete:\nUnit");
  });
});

describe("V11: outward signatory (C7)", () => {
  const list = seed.staffFromWorkbook.signatories.map((s, i) => ({
    ...s,
    active: true,
    isDefault: i === 1,
  }));

  it("choosing Jide Onakoya fills in Chairman; a typed designation wins", () => {
    const jide = list.find((s) => s.name === "Jide Onakoya")!;
    expect(signatoryDesignation(jide, null)).toBe("Chairman");
    expect(signatoryDesignation(jide, "  ")).toBe("Chairman");
    expect(signatoryDesignation(jide, "Acting Chairman")).toBe(
      "Acting Chairman",
    );
    expect(signatoryDesignation(null, null)).toBeNull();
  });

  it("the default signatory is the Secretary to the Commission", () => {
    expect(defaultSignatory(list)?.designation).toBe(
      "Secretary to the Commission",
    );
  });
});

describe("V12: email modes (C6.3)", () => {
  const event = {
    kind: "ack" as const,
    unit: "ICT unit",
    to: ["it@ogserc.org.ng"],
    cc: [],
    emailedTo: [],
    pendingReview: [],
  };

  it("Off → no email and nothing recorded (no message line on save)", () => {
    expect(planAckEmail({ ...event, mode: "OFF" })).toEqual({
      action: "none",
      line: null,
    });
    expect(
      planAckEmail({ ...event, kind: "resend", mode: "OFF" }),
    ).toMatchObject({
      action: "none",
      line: expect.stringContaining("switched off"),
    });
  });

  it("Review → a pending email; Send → sent with the recipients", () => {
    expect(planAckEmail({ ...event, mode: "REVIEW" })).toMatchObject({
      action: "review",
      to: ["it@ogserc.org.ng"],
    });
    expect(planAckEmail({ ...event, mode: "SEND" })).toMatchObject({
      action: "send",
      to: ["it@ogserc.org.ng"],
    });
  });

  it("Review: a pending email counts as covered for routing; a unit change supersedes it (agreed C6 b)", () => {
    const pending = [{ id: "e1", to: ["it@ogserc.org.ng"] }];
    expect(
      planAckEmail({
        ...event,
        kind: "routing",
        mode: "REVIEW",
        pendingReview: pending,
      }),
    ).toEqual({ action: "none", line: null });
    expect(
      planAckEmail({
        ...event,
        kind: "routing",
        mode: "REVIEW",
        unit: "Engineering Standards unit",
        to: ["engineeringstandards@ogserc.org.ng"],
        pendingReview: pending,
      }),
    ).toEqual({
      action: "review",
      to: ["engineeringstandards@ogserc.org.ng"],
      cc: [],
      supersede: ["e1"],
    });
  });

  it("cc comes from settings, without addresses already in To", () => {
    expect(
      resolveRecipients({
        unitEmails: ["IT@ogserc.org.ng"],
        divisionEmails: [],
        cc: "registry@ogserc.org.ng; it@ogserc.org.ng",
      }),
    ).toEqual({ to: ["it@ogserc.org.ng"], cc: ["registry@ogserc.org.ng"] });
  });

  it("resend confirm wording (C6.1)", () => {
    expect(
      resendPrompt(
        "OGSERC/ACK/2026/00002",
        instantIn("2026-12-10", "09:05"),
        ["it@ogserc.org.ng", "x@ogserc.org.ng"],
        LAGOS,
      ),
    ).toBe(
      "OGSERC/ACK/2026/00002 was emailed on 10-Dec-2026 09:05 to it@ogserc.org.ng; x@ogserc.org.ng. Send it again?",
    );
  });
});

describe("C6.4: email content (workbook wording)", () => {
  const content = {
    no: "OGSERC/ACK/2026/00002",
    type: "Deficiency response",
    sender: "Sample Mini-Grid Ltd",
    subject: "Response to deficiency notice",
    receivedAt: instantIn("2026-11-30", "18:40"),
    deemedReceiptDate: "2026-12-01",
    receivedBy: "Registry Officer 1",
    unit: "ICT unit",
    division: "Financial Management Services",
  };

  it("save / resend", () => {
    const e = composeAckEmail("ack", content, LAGOS);
    expect(e.subject).toBe(
      "Acknowledgement OGSERC/ACK/2026/00002 - Deficiency response from Sample Mini-Grid Ltd",
    );
    expect(e.attachmentName).toBe("Slip OGSERC-ACK-2026-00002.pdf");
    expect(e.body.split("\r\n")).toEqual([
      "The Registry has received and acknowledged the item below.",
      "",
      "Inward / Ack. No.:  OGSERC/ACK/2026/00002",
      "Type:  Deficiency response",
      "Sender:  Sample Mini-Grid Ltd",
      "Subject:  Response to deficiency notice",
      "Received:  30-Nov-2026 18:40  (deemed 01-Dec-2026)",
      "Received by:  Registry Officer 1",
      "Unit:  ICT unit",
      "Division:  Financial Management Services",
      "",
      "Routing, file reference and handling will follow from the Secretary to the Commission / Head of Administration.",
      "",
      "The acknowledgement slip is attached.",
      "",
      "OGSERC Registry",
    ]);
    expect(composeAckEmail("resend", content, LAGOS).subject).toBe(e.subject);
  });

  it("routing", () => {
    const e = composeAckEmail(
      "routing",
      {
        ...content,
        routing: {
          routedBy: "Oluwatoyin Sonoiki",
          actionRequired: "Action required",
          priority: null,
          actionOfficer: "Head, ICT",
          responseDue: "2026-12-15",
          fileReference: "OGSERC/RL/001",
        },
      },
      LAGOS,
    );
    expect(e.subject).toBe(
      "Routed to ICT unit: OGSERC/ACK/2026/00002 - Sample Mini-Grid Ltd",
    );
    expect(e.body).toContain(
      "Routed by:  Oluwatoyin Sonoiki\r\nAction required:  Action required\r\nPriority:  —\r\nAction officer:  Head, ICT\r\nResponse due:  15-Dec-2026\r\nFile reference:  OGSERC/RL/001\r\n\r\nThe acknowledgement slip is attached.",
    );
    expect(e.body).not.toContain("will follow from");
  });
});

describe("V14 and C4: New Inward without routing", () => {
  it("V14: action left blank saves with no 'Missing required field'; the type target applies", () => {
    const { derived } = withI2({ actionRequired: null });
    expect(derived.flags).not.toContain(INWARD_FLAGS.missingRequired);
    expect(derived.responseDue).toBe("2026-12-15");
  });

  it("C4 save message names the suggested unit; the email line follows", () => {
    expect(savedInwardMessage("OGSERC/ACK/2026/00004", "Licensing unit")).toBe(
      "Saved as OGSERC/ACK/2026/00004.\nSuggested unit: Licensing unit\nRouting, file reference and handling will be set by the Secretary / Head of Admin on the Routing Desk.",
    );
    expect(
      savedInwardMessage(
        "X",
        "Licensing unit",
        noAddressLine("Licensing unit"),
      ),
    ).toMatch(/Routing Desk\.\n\nAcknowledgement not emailed/);
  });
});
