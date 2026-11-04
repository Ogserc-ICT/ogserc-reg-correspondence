// Acknowledgement email (SPEC-v2 C6) against the database with an in-memory
// transport: V2, V3 and V12, Review and Send end to end, supersede, failure
// and retry, no double send, Resend, roles and the settings guard.
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import {
  ACK_EMAIL_OFF,
  emailedLine,
  noAddressLine,
  notEmailedLine,
  reviewLine,
} from "@/domain/ack-email";
import type { AckEmailMode } from "@/generated/prisma/client";
import {
  deliverEmail,
  discardReviewedEmail,
  emailsToReview,
  MAX_ATTEMPTS,
  resendAckEmail,
  ResendNeedsConfirm,
  retryEmails,
  sendReviewedEmail,
} from "@/server/email/ack";
import {
  devTransport,
  NO_TRANSPORT,
  setMailTransportForTests,
  type MailMessage,
} from "@/server/email/transport";
import { ForbiddenError, ValidationError } from "@/server/errors";
import type { Actor } from "@/server/registers";
import { getSettings, updateSettings } from "@/server/settings";
import { logInward } from "@/server/workflows/inward";
import { routeInward } from "@/server/workflows/routing";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let officer: Actor;
let secretary: Actor;
let sent: MailMessage[];

const list = async (list: string, label: string) =>
  (
    await db.listItem.findFirstOrThrow({
      where: { list: list as never, label },
    })
  ).id;
const unitId = async (name: string) =>
  (await db.unit.findUniqueOrThrow({ where: { name } })).id;

function memoryTransport() {
  setMailTransportForTests({
    name: "memory",
    async send(m) {
      sent.push(m);
      return { id: String(sent.length) };
    },
  });
}

async function setMode(mode: AckEmailMode, cc = "") {
  await db.registrySettings.update({
    where: { id: 1 },
    data: { ackEmailMode: mode, ackEmailCc: cc },
  });
}

async function setUnitEmails(name: string, emails: string[]) {
  await db.unit.update({ where: { name }, data: { emails } });
}

/** A consumer complaint: suggested unit "Customer Complaints". */
async function newInwardRaw() {
  return {
    receivedDate: "2026-12-10",
    receivedTime: "08:30",
    modeId: await list("RECEIPT_MODE", "Hand delivery"),
    typeId: (
      await db.incomingType.findUniqueOrThrow({
        where: { name: "Consumer complaint" },
      })
    ).id,
    sender: "Mrs A. Customer",
    senderCategoryId: await list(
      "PARTY_CATEGORY",
      "Consumer / member of public",
    ),
    subject: "Estimated billing",
    receivedById: officer.user.id,
    ackIssuedViaId: await list("ACK_VIA", "Printed slip"),
  };
}

const route = async (
  who: Actor,
  id: string,
  over: Record<string, string> = {},
) =>
  routeInward(db, who, id, {
    actionRequiredId: await list("ACTION_REQUIRED", "Action required"),
    ...over,
  });

const logsFor = (id: string) =>
  db.emailLog.findMany({
    where: { inwardItemId: id },
    orderBy: { createdAt: "asc" },
  });

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  officer = await actorFor(db, ids.users.officer);
  secretary = await actorFor(db, ids.users.secretary);
  sent = [];
  memoryTransport();
});
afterEach(() => setMailTransportForTests(undefined));

describe("V12: Off, Review, Send", () => {
  it("Off sends and records nothing; Resend says it is switched off", async () => {
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message).not.toContain("Acknowledgement");
    expect(await logsFor(r.item.id)).toEqual([]);
    expect(sent).toEqual([]);
    await expect(resendAckEmail(db, officer, r.item.id)).rejects.toThrow(
      ACK_EMAIL_OFF,
    );
  });

  it("Review holds it; ackEmailedAt stays empty until it is sent", async () => {
    await setMode("REVIEW", "Registry@OGSERC.org.ng");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message.split("\n\n")[1]).toBe(reviewLine("Customer Complaints"));
    const [held] = await emailsToReview(db, officer.user);
    expect(held).toMatchObject({
      status: "PENDING_REVIEW",
      kind: "ACK",
      to: ["complaints@ogserc.org.ng"],
      cc: ["registry@ogserc.org.ng"],
      subject:
        "Acknowledgement OGSERC/ACK/2026/00004 - Consumer complaint from Mrs A. Customer",
    });
    expect(sent).toEqual([]);
    let item = await db.inwardItem.findUniqueOrThrow({
      where: { id: r.item.id },
    });
    expect(item.ackEmailedAt).toBeNull();

    const s = await sendReviewedEmail(db, officer, held.id);
    expect(s.message).toBe(
      `OGSERC/ACK/2026/00004: ${emailedLine("Customer Complaints", ["complaints@ogserc.org.ng"])}`,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].attachments[0]).toMatchObject({
      filename: "Slip OGSERC-ACK-2026-00004.pdf",
      contentType: "application/pdf",
    });
    expect(
      Buffer.from(sent[0].attachments[0].content).subarray(0, 5).toString(),
    ).toBe("%PDF-");
    item = await db.inwardItem.findUniqueOrThrow({ where: { id: r.item.id } });
    expect(item.ackEmailedTo).toEqual(["complaints@ogserc.org.ng"]);
    expect(item.ackEmailedAt).toEqual(DEC_10);
    const [log] = await logsFor(r.item.id);
    expect(log).toMatchObject({
      status: "SENT",
      reviewedById: officer.user.id,
      attempts: 1,
    });
    await expect(sendReviewedEmail(db, officer, held.id)).rejects.toThrow(
      "no longer waiting for review",
    );
  });

  it("Review → Discard: never sent, kept in the log", async () => {
    await setMode("REVIEW");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    const [held] = await emailsToReview(db, officer.user);
    await discardReviewedEmail(db, officer, held.id);
    expect((await logsFor(r.item.id))[0].status).toBe("DISCARDED");
    expect(sent).toEqual([]);
    expect(await emailsToReview(db, officer.user)).toEqual([]);
  });

  it("Send emails it on save, recorded with its recipients", async () => {
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message.split("\n\n")[1]).toBe(
      emailedLine("Customer Complaints", ["complaints@ogserc.org.ng"]),
    );
    expect(sent.map((m) => m.to)).toEqual([["complaints@ogserc.org.ng"]]);
    expect((await logsFor(r.item.id))[0]).toMatchObject({
      status: "SENT",
      kind: "ACK",
      sentAt: DEC_10,
    });
  });

  it("Send with no address set: not emailed, nothing recorded", async () => {
    await setMode("SEND");
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message.split("\n\n")[1]).toBe(
      noAddressLine("Customer Complaints"),
    );
    expect(await logsFor(r.item.id)).toEqual([]);
  });
});

describe("routing emails (V2, V3)", () => {
  it("V2: routing I2 with no address anywhere sends nothing and says so", async () => {
    await setMode("SEND");
    const r = await route(secretary, ids.I2);
    expect(r.message).toBe(
      [
        "OGSERC/ACK/2026/00002 routed to Licensing unit by Secretary to the Commission.",
        "Status: Awaiting forwarding",
        "",
        "Acknowledgement not emailed: no email address is set for 'Licensing unit' or its division. Add one in Admin › Units.",
      ].join("\n"),
    );
    expect(await logsFor(ids.I2)).toEqual([]);
  });

  it("V3: re-routed to the ICT unit → emailed once; again → nothing", async () => {
    await setMode("SEND");
    await route(secretary, ids.I2);
    const ict = await unitId("ICT unit");
    const r = await route(secretary, ids.I2, { unitOverrideId: ict });
    expect(r.message).toContain(emailedLine("ICT unit", ["it@ogserc.org.ng"]));
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(
      "Routed to ICT unit: OGSERC/ACK/2026/00002 - Sample Mini-Grid Ltd",
    );
    expect(sent[0].body).toContain("Routed by:  Secretary to the Commission");
    const again = await route(secretary, ids.I2, { unitOverrideId: ict });
    expect(again.message).not.toContain("Acknowledgement");
    expect(sent).toHaveLength(1);
    expect(
      await db.routingEvent.count({ where: { inwardItemId: ids.I2 } }),
    ).toBe(3);
  });

  it("routing to the unit already emailed at save sends nothing", async () => {
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const { item } = await logInward(db, officer, await newInwardRaw());
    expect(sent).toHaveLength(1);
    const r = await route(secretary, item.id);
    expect(r.message).not.toContain("Acknowledgement");
    expect(sent).toHaveLength(1);
  });

  it("Review: re-routing supersedes the email still waiting", async () => {
    await setMode("REVIEW");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const { item } = await logInward(db, officer, await newInwardRaw());
    // Same unit: covered by the email waiting for review.
    await route(secretary, item.id);
    expect(await logsFor(item.id)).toHaveLength(1);
    await route(secretary, item.id, {
      unitOverrideId: await unitId("ICT unit"),
    });
    const logs = await logsFor(item.id);
    expect(logs.map((l) => [l.kind, l.status, l.to])).toEqual([
      ["ACK", "SUPERSEDED", ["complaints@ogserc.org.ng"]],
      ["ROUTING", "PENDING_REVIEW", ["it@ogserc.org.ng"]],
    ]);
  });
});

describe("re-routing notice to the previous unit (Q-V2-2)", () => {
  async function loggedAndRouted() {
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const { item } = await logInward(db, officer, await newInwardRaw());
    const r = await route(secretary, item.id, {
      unitOverrideId: await unitId("ICT unit"),
    });
    return { item, r };
  }
  const notify = (on: boolean) =>
    db.registrySettings.update({
      where: { id: 1 },
      data: { notifyPreviousUnitOnReroute: on },
    });

  it("tells the unit that had the acknowledgement, without a slip", async () => {
    await setMode("SEND");
    await notify(true);
    const { item, r } = await loggedAndRouted();
    expect(r.message.split("\n\n").slice(1)).toEqual([
      emailedLine("ICT unit", ["it@ogserc.org.ng"]),
      "Customer Complaints told the item has moved (complaints@ogserc.org.ng).",
    ]);
    const notice = sent.find((m) => m.subject.startsWith("Re-routed:"))!;
    expect(notice).toMatchObject({
      to: ["complaints@ogserc.org.ng"],
      subject:
        "Re-routed: OGSERC/ACK/2026/00004 - Mrs A. Customer is now with ICT unit",
      attachments: [],
    });
    expect((await logsFor(item.id)).map((l) => [l.kind, l.status])).toEqual([
      ["ACK", "SENT"],
      ["ROUTING", "SENT"],
      ["REROUTE", "SENT"],
    ]);
    // A notice is not an acknowledgement.
    const after = await db.inwardItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(after.ackEmailedTo).toEqual([
      "complaints@ogserc.org.ng",
      "it@ogserc.org.ng",
    ]);
  });

  it("sends nothing with the setting off (default)", async () => {
    await setMode("SEND");
    const { item, r } = await loggedAndRouted();
    expect(r.message).not.toContain("told the item has moved");
    expect((await logsFor(item.id)).map((l) => l.kind)).toEqual([
      "ACK",
      "ROUTING",
    ]);
  });

  it("holds it for review in Review mode, and skips a unit never emailed", async () => {
    await setMode("REVIEW");
    await notify(true);
    const { item, r } = await loggedAndRouted();
    // Review: the acknowledgement was never sent, so nobody to tell.
    expect(r.message).not.toContain("has moved");
    const [held] = await emailsToReview(db, officer.user);
    await sendReviewedEmail(db, officer, held.id);
    await route(secretary, item.id); // back to the type's unit
    const notices = (await logsFor(item.id)).filter(
      (l) => l.kind === "REROUTE",
    );
    expect(notices.map((n) => [n.status, n.to])).toEqual([
      ["PENDING_REVIEW", ["it@ogserc.org.ng"]],
    ]);
  });
});

describe("failures, retry and no double send (C6.5)", () => {
  it("no provider: recorded as not sent, retried by the job once one is set up", async () => {
    setMailTransportForTests(null);
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message.split("\n\n")[1]).toBe(notEmailedLine(NO_TRANSPORT));
    let [log] = await logsFor(r.item.id);
    expect(log).toMatchObject({
      status: "QUEUED",
      attempts: 1,
      error: NO_TRANSPORT,
    });
    expect(
      (await db.inwardItem.findUniqueOrThrow({ where: { id: r.item.id } }))
        .ackEmailedAt,
    ).toBeNull();

    memoryTransport();
    // Not due yet: the backoff holds it back.
    expect((await retryEmails(db, DEC_10)).result).toMatchObject({ due: 0 });
    const later = new Date(DEC_10.getTime() + 60 * 60_000);
    const job = await retryEmails(db, later);
    expect(job.summary).toBe("1 sent, 0 not sent; 0 still queued.");
    [log] = await logsFor(r.item.id);
    expect(log).toMatchObject({ status: "SENT", attempts: 2, error: null });
    expect(sent).toHaveLength(1);
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts`, async () => {
    setMailTransportForTests({
      name: "broken",
      async send() {
        throw new Error("mailbox full");
      },
    });
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message).toContain(
      "Acknowledgement not emailed: the email provider refused it (mailbox full).",
    );
    let t = DEC_10.getTime();
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      t += 24 * 60 * 60_000;
      await retryEmails(db, new Date(t));
    }
    const [log] = await logsFor(r.item.id);
    expect(log).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
  });

  it("two senders at once send it once", async () => {
    setMailTransportForTests(null);
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const r = await logInward(db, officer, await newInwardRaw());
    memoryTransport();
    const [log] = await logsFor(r.item.id);
    const later = new Date(DEC_10.getTime() + 60 * 60_000);
    await Promise.all([
      deliverEmail(db, log.id, later, null),
      deliverEmail(db, log.id, later, null),
      retryEmails(db, later),
    ]);
    // One claim wins; the others find it already taken.
    expect(sent).toHaveLength(1);
    expect((await logsFor(r.item.id))[0]).toMatchObject({
      status: "SENT",
      attempts: 2,
    });
  });
});

describe("Resend (C6.1) and roles (C12)", () => {
  it("asks before resending an item already emailed, then sends it again", async () => {
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    const { item } = await logInward(db, officer, await newInwardRaw());
    await expect(resendAckEmail(db, officer, item.id)).rejects.toThrow(
      new ResendNeedsConfirm(
        "OGSERC/ACK/2026/00004 was emailed on 10-Dec-2026 09:00 to complaints@ogserc.org.ng. Send it again?",
      ),
    );
    const r = await resendAckEmail(db, officer, item.id, { confirm: true });
    expect(r.message).toBe(
      emailedLine("Customer Complaints", ["complaints@ogserc.org.ng"]),
    );
    expect((await logsFor(item.id)).map((l) => l.kind)).toEqual([
      "ACK",
      "RESEND",
    ]);
    expect(sent).toHaveLength(2);
  });

  it("unit officers can't resend or review", async () => {
    await setMode("REVIEW");
    const unitOfficer = await db.user.create({
      data: {
        name: "Licensing officer",
        email: "lic@ogserc.test",
        role: "UNIT_OFFICER",
        unitId: await unitId("Licensing unit"),
      },
    });
    const u = await actorFor(db, unitOfficer.id);
    await expect(resendAckEmail(db, u, ids.I2)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(emailsToReview(db, u.user)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("settings guard and the dev transport", () => {
  it("won't switch the email on without a provider; normalises the CC", async () => {
    const admin = await db.user.create({
      data: { name: "Admin", email: "admin@ogserc.test", role: "ADMIN" },
    });
    const a = (await actorFor(db, admin.id)).user;
    const s = await getSettings(db, a);
    setMailTransportForTests(null);
    await expect(
      updateSettings(db, a, { ...s, ackEmailMode: "SEND" }, DEC_10),
    ).rejects.toThrow("no email provider is set up");
    await expect(
      updateSettings(db, a, { ...s, ackEmailCc: "not-an-address" }, DEC_10),
    ).rejects.toBeInstanceOf(ValidationError);
    memoryTransport();
    const saved = await updateSettings(
      db,
      a,
      {
        ...s,
        ackEmailMode: "REVIEW",
        ackEmailCc: "Registry@OGSERC.org.ng, x@y.ng",
      },
      DEC_10,
    );
    expect(saved).toMatchObject({
      ackEmailMode: "REVIEW",
      ackEmailCc: "registry@ogserc.org.ng; x@y.ng",
    });
  });

  it("the dev transport writes a MIME message with the slip attached", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ogserc-mail-"));
    setMailTransportForTests(devTransport(dir, "registry@ogserc.test"));
    await setMode("SEND");
    await setUnitEmails("Customer Complaints", ["complaints@ogserc.org.ng"]);
    await logInward(db, officer, await newInwardRaw());
    const [file] = await readdir(dir);
    const eml = await readFile(path.join(dir, file), "utf8");
    expect(eml).toContain("To: complaints@ogserc.org.ng");
    expect(eml).toContain(
      "Subject: Acknowledgement OGSERC/ACK/2026/00004 - Consumer complaint from Mrs A. Customer",
    );
    expect(eml).toContain(
      'Content-Disposition: attachment; filename="Slip OGSERC-ACK-2026-00004.pdf"',
    );
  });
});
