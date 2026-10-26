// Phase 4 workflows against the database: validation (R10, "Please
// complete:"), messages (TEMPLATES §4), one-click actions, Head of Registry
// edits, and N1 driven through the workflows.
import { beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { ForbiddenError } from "@/server/errors";
import { voidItem, type Actor } from "@/server/registers";
import { FormProblems } from "@/server/workflows/common";
import {
  closeToday,
  forwardToday,
  logInward,
  updateInward,
} from "@/server/workflows/inward";
import {
  deliverToday,
  dispatchToday,
  logOutward,
  updateOutward,
} from "@/server/workflows/outward";
import { actorFor, connectTestDb, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let officer: Actor;
let head: Actor;

const list = async (list: string, label: string) =>
  (
    await db.listItem.findFirstOrThrow({
      where: { list: list as never, label },
    })
  ).id;
const unit = async (name: string) =>
  (await db.unit.findUniqueOrThrow({ where: { name } })).id;
const inType = async (name: string) =>
  (await db.incomingType.findUniqueOrThrow({ where: { name } })).id;
const outType = async (name: string) =>
  (await db.outgoingType.findUniqueOrThrow({ where: { name } })).id;

async function problemsOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof FormProblems)
      return { missing: e.missing, problems: e.problems };
    throw e;
  }
  throw new Error("expected FormProblems");
}

async function newInwardRaw(extra: Record<string, string> = {}) {
  return {
    receivedDate: "2026-12-10",
    receivedTime: "08:30",
    modeId: await list("RECEIPT_MODE", "Hand delivery"),
    typeId: await inType("Consumer complaint"),
    sender: "Mrs A. Customer",
    senderCategoryId: await list(
      "PARTY_CATEGORY",
      "Consumer / member of public",
    ),
    subject: "Estimated billing",
    receivedById: officer.user.id,
    ackIssuedViaId: await list("ACK_VIA", "Printed slip"),
    actionRequiredId: await list("ACTION_REQUIRED", "Reply required"),
    priorityId: "",
    amountShown: "",
    ...extra,
  };
}

async function newOutwardRaw(extra: Record<string, string> = {}) {
  return {
    documentDate: "2026-12-10",
    typeId: await outType("Reply to correspondence"),
    subject: "Re: deficiency response",
    addressee: "Sample Mini-Grid Ltd",
    recipientCategoryId: await list("PARTY_CATEGORY", "Registrant / licensee"),
    originatingUnitId: await unit("Registration & Licensing"),
    signedById: ids.users.secretary,
    signatoryDesignation: "",
    dispatchModeId: await list("RECEIPT_MODE", "Email"),
    dateDispatched: "",
    dispatchedById: officer.user.id,
    ...extra,
  };
}

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  officer = await actorFor(db, ids.users.officer);
  head = await actorFor(db, ids.users.head);
});

describe("New Inward", () => {
  it("saves with the next number and the TEMPLATES message", async () => {
    const r = await logInward(db, officer, await newInwardRaw());
    expect(r.message).toBe(
      "Saved as OGSERC/ACK/2026/00004. Forward to: Consumer Affairs.",
    );
    expect(r.item.statusCache).toBe("AWAITING_FORWARDING");
  });

  it("lists every missing field in form order, and other problems too", async () => {
    const raw = await newInwardRaw({
      sender: " ",
      subject: "",
      receivedTime: "",
      email: "not-an-email",
      volumes: "-2",
    });
    expect(await problemsOf(logInward(db, officer, raw))).toEqual({
      missing: ["Date & time received", "Sender", "Subject"],
      problems: [
        "Files / volumes: enter a whole number, 0 or more.",
        "Email: enter a valid email address.",
      ],
    });
    expect(await db.inwardItem.count()).toBe(3);
  });

  it("refuses a receipt time in the future (R10)", async () => {
    const raw = await newInwardRaw({ receivedTime: "09:01" }); // now is 09:00
    expect((await problemsOf(logInward(db, officer, raw))).problems).toEqual([
      "Date & time received can't be in the future.",
    ]);
  });

  it("refuses ids from the wrong list and links to void items", async () => {
    const raw = await newInwardRaw({
      modeId: await list("ACK_VIA", "Email"),
      inResponseToOutwardId: ids.O2,
    });
    await db.$transaction((tx) =>
      voidItem(tx, "outward", ids.O2, "Test", head),
    );
    expect((await problemsOf(logInward(db, officer, raw))).problems).toEqual([
      "Mode of receipt: choose a value from the list.",
      "In response to our ref.: choose an outward item from the search.",
    ]);
  });

  it("is refused to read-only roles", async () => {
    const secretary = await actorFor(db, ids.users.secretary);
    await expect(
      logInward(db, secretary, await newInwardRaw()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("inward handling", () => {
  it("Forwarded today, then Close today with a note", async () => {
    expect((await forwardToday(db, officer, ids.I2)).message).toBe(
      "OGSERC/ACK/2026/00002 forwarded today.",
    );
    let i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2.dateForwarded?.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(i2.statusCache).toBe("OPEN");

    await expect(closeToday(db, officer, ids.I2, " ")).rejects.toThrow(
      "closing note",
    );
    await closeToday(db, officer, ids.I2, "Answered by phone");
    i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2).toMatchObject({
      statusCache: "CLOSED",
      closingNote: "Answered by phone",
    });
    await expect(closeToday(db, officer, ids.I2, "Again")).rejects.toThrow(
      "already closed",
    );

    const actions = (
      await db.auditLog.findMany({
        where: { entityId: ids.I2 },
        orderBy: { id: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(["create", "forward", "close"]);
  });

  it("lets officers change handling fields only, with date-order checks", async () => {
    const r = await updateInward(db, officer, ids.I2, {
      sender: "Someone else",
    });
    expect(r.message).toBe("Nothing changed.");

    expect(
      await problemsOf(
        updateInward(db, officer, ids.I2, { dateForwarded: "2026-11-29" }),
      ),
    ).toEqual({
      missing: [],
      problems: ["Date forwarded can't be before the date received."],
    });
    expect(
      await problemsOf(
        updateInward(db, officer, ids.I2, { dateClosedManual: "2026-12-05" }),
      ),
    ).toEqual({ missing: ["Closing note"], problems: [] });

    await updateInward(db, officer, ids.I2, {
      dateForwarded: "2026-12-02",
      unitOverrideId: await unit("Legal"),
    });
    const i2 = await db.inwardItem.findUniqueOrThrow({
      where: { id: ids.I2 },
      include: { routedUnit: true },
    });
    expect(i2.routedUnit.name).toBe("Legal");
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: ids.I2, action: "update" },
    });
    expect(log.before).toMatchObject({ dateForwarded: null });
    expect(log.after).toMatchObject({ dateForwarded: "2026-12-02" });
  });

  it("lets only the Head of Registry edit registered details, with a reason", async () => {
    const raw = { receivedDate: "2026-12-04", receivedTime: "17:30" };
    await expect(
      updateInward(db, officer, ids.I2, raw, { full: true, reason: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateInward(db, head, ids.I2, raw, { full: true }),
    ).rejects.toThrow("reason");
    await updateInward(db, head, ids.I2, raw, {
      full: true,
      reason: "Wrong time typed",
    });
    const i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    // Email on Fri 4 Dec at 17:30 → Mon 7 Dec; the number is kept.
    expect(i2.deemedReceiptDate.toISOString().slice(0, 10)).toBe("2026-12-07");
    expect(i2.number).toBe("OGSERC/ACK/2026/00002");
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: ids.I2, action: "edit" },
    });
    expect(log.note).toBe("Wrong time typed");
  });
});

describe("New Outward and outward handling", () => {
  it("saves with the TEMPLATES message, no dispatcher without a dispatch date", async () => {
    const r = await logOutward(db, officer, await newOutwardRaw());
    expect(r.message).toBe(
      "Outward number: OGSERC/OUT/2026/00003. Quote it on the document.",
    );
    expect(r.item).toMatchObject({
      dispatchedById: null,
      signatoryDesignation: "Secretary to the Commission",
      statusCache: "NOT_YET_DISPATCHED",
    });
  });

  it("Dispatched today and Delivered today, in that order only", async () => {
    const { item } = await logOutward(db, officer, await newOutwardRaw());
    await expect(deliverToday(db, officer, item.id)).rejects.toThrow(
      "Record the dispatch first (DISPATCHED TODAY).",
    );
    await dispatchToday(db, officer, item.id);
    await deliverToday(db, officer, item.id);
    const o = await db.outwardItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(o).toMatchObject({
      dispatchedById: officer.user.id,
      deliveryConfirmed: true,
      statusCache: "DELIVERED",
    });
  });

  it("blocks delivery before dispatch and dispatch before the document (R10)", async () => {
    expect(
      await problemsOf(
        updateOutward(db, officer, ids.O1, { dateDelivered: "2026-11-24" }),
      ),
    ).toEqual({
      missing: [],
      problems: ["Date delivered can't be before the date dispatched."],
    });
    expect(
      (
        await problemsOf(
          logOutward(
            db,
            officer,
            await newOutwardRaw({ dateDispatched: "2026-12-09" }),
          ),
        )
      ).problems,
    ).toEqual(["Date dispatched can't be before the date of the document."]);
  });

  it("N1 through the workflows: a holding reply leaves I2 open, a reply closes it", async () => {
    const holding = await logOutward(
      db,
      officer,
      await newOutwardRaw({
        typeId: await outType("Acknowledgement / holding reply"),
        inReplyToInwardId: ids.I2,
        documentDate: "2026-12-02",
        dateDispatched: "2026-12-02",
      }),
    );
    let i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2.statusCache).toBe("AWAITING_FORWARDING");

    const reply = await logOutward(
      db,
      officer,
      await newOutwardRaw({
        inReplyToInwardId: ids.I2,
        documentDate: "2026-12-08",
      }),
    );
    i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2.statusCache).toBe("AWAITING_FORWARDING"); // not dispatched yet

    await updateOutward(db, officer, reply.item.id, {
      dateDispatched: "2026-12-08",
    });
    i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2.statusCache).toBe("CLOSED");
    expect(holding.item.number).toBe("OGSERC/OUT/2026/00003");
  });
});
