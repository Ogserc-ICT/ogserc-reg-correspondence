// Front desk intake and registering it on New Inward (SPEC-v2 C3, C4):
// fixtures V6, V7, V8, the reason for a changed receipt (E7), double
// registration (E8) and who may do what (C12).
import { beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { instantIn } from "@/domain/clock";
import type { Role } from "@/generated/prisma/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import type { Actor } from "@/server/registers";
import { FormProblems } from "@/server/workflows/common";
import {
  awaitingRegistry,
  intakeForPull,
  intakeLog,
  logIntake,
} from "@/server/workflows/front-desk";
import { logInward } from "@/server/workflows/inward";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let officer: Actor;
let fdUserId: string;

const list = async (list: string, label: string) =>
  (
    await db.listItem.findFirstOrThrow({
      where: { list: list as never, label },
    })
  ).id;
const inType = async (name: string) =>
  (await db.incomingType.findUniqueOrThrow({ where: { name } })).id;

async function makeUser(role: Role) {
  return db.user.create({
    data: {
      name: `${role} ${Math.random().toString(36).slice(2, 6)}`,
      email: `${role.toLowerCase()}.${Math.random().toString(36).slice(2)}@ogserc.test`,
      role,
    },
  });
}

const at = (userId: string, date: string, time: string) =>
  actorFor(db, userId, instantIn(date, time));

async function intakeRaw(extra: Record<string, string> = {}) {
  return {
    receivedDate: "2026-12-04",
    receivedTime: "16:30",
    modeId: await list("RECEIPT_MODE", "Hand delivery"),
    typeId: "",
    sender: "Verde Solar Ltd",
    subject: "Application for mini-grid permit",
    deliveredBy: "Mr B. Courier",
    phone: "08030000000",
    volumes: "2",
    remarks: "",
    ...extra,
  };
}

/** New Inward as the registry fills it after pulling the intake. */
async function inwardRaw(
  intakeId: string,
  pulled: Record<string, string>,
  extra: Record<string, string> = {},
) {
  return {
    ...pulled,
    typeId: await inType("Consumer complaint"),
    senderCategoryId: await list("PARTY_CATEGORY", "Registrant / licensee"),
    receivedById: officer.user.id,
    ackIssuedViaId: await list("ACK_VIA", "Printed slip"),
    frontDeskIntakeId: intakeId,
    ...extra,
  };
}

async function problemsOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof FormProblems)
      return { missing: e.missing, problems: e.problems };
    if (e instanceof ValidationError)
      return { missing: [], problems: e.problems };
    throw e;
  }
  throw new Error("expected a validation error");
}

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  officer = await actorFor(db, ids.users.officer);
  fdUserId = (await makeUser("FRONT_DESK_OFFICER")).id;
});

describe("V6: hand delivery logged at the front desk, registered later", () => {
  it("logs, waits, is pulled, registered once, and can't be pulled again", async () => {
    const fd = await at(fdUserId, "2026-12-04", "16:35");
    const logged = await logIntake(db, fd, await intakeRaw());
    expect(logged.intake.intakeNo).toBe("OGSERC/FD/2026/00001");
    expect(logged.message).toBe(
      "Logged as OGSERC/FD/2026/00001. No acknowledgement has been issued. Pass the document to the Registry - it stays on the 'Awaiting registry' list until the Registry registers it.",
    );
    expect(logged.intake.receivedById).toBe(fdUserId);

    // 10 Dec: still waiting, 4 working days.
    const [waiting] = await awaitingRegistry(db, officer.user, DEC_10);
    expect(waiting.intakeNo).toBe("OGSERC/FD/2026/00001");
    expect(waiting.derived).toMatchObject({
      status: "Awaiting registry",
      workingDaysWaiting: 4,
    });

    // Pull: only non-blank values (remarks and type were blank).
    const pull = await intakeForPull(db, officer.user, logged.intake.id);
    expect(pull.values).toEqual({
      receivedDate: "2026-12-04",
      receivedTime: "16:30",
      modeId: await list("RECEIPT_MODE", "Hand delivery"),
      sender: "Verde Solar Ltd",
      subject: "Application for mini-grid permit",
      phone: "08030000000",
      deliveredBy: "Mr B. Courier",
      volumes: "2",
    });

    const saved = await logInward(
      db,
      officer,
      await inwardRaw(logged.intake.id, pull.values),
    );
    expect(saved.item.number).toBe("OGSERC/ACK/2026/00004");
    expect(saved.item.receivedAt).toEqual(instantIn("2026-12-04", "16:30"));
    expect(saved.item.deemedReceiptDate).toEqual(new Date("2026-12-04"));
    expect(saved.item.frontDeskIntakeId).toBe(logged.intake.id);

    const [row] = await intakeLog(db, officer.user, {}, DEC_10);
    expect(row.inwardItem?.number).toBe("OGSERC/ACK/2026/00004");
    expect(row.registeredAt).toEqual(DEC_10);
    expect(row.derived).toMatchObject({
      status: "Registered",
      workingDaysWaiting: 4,
    });
    expect(await awaitingRegistry(db, officer.user, DEC_10)).toEqual([]);

    const again =
      "OGSERC/FD/2026/00001 is already registered as OGSERC/ACK/2026/00004.";
    await expect(
      intakeForPull(db, officer.user, logged.intake.id),
    ).rejects.toThrow(again);
    expect(
      await problemsOf(
        logInward(db, officer, await inwardRaw(logged.intake.id, pull.values)),
      ),
    ).toEqual({ missing: [], problems: [again] });
    expect(await db.inwardItem.count()).toBe(4);

    const audits = await db.auditLog.findMany({
      where: { entityId: logged.intake.id },
      orderBy: { at: "asc" },
    });
    expect(audits.map((a) => a.action)).toEqual(["create", "register"]);
    expect(audits[1].after).toMatchObject({
      inwardItem: "OGSERC/ACK/2026/00004",
    });
  });

  it("refuses a second registration racing the first (E8)", async () => {
    const fd = await at(fdUserId, "2026-12-04", "16:35");
    const { intake } = await logIntake(db, fd, await intakeRaw());
    const pull = await intakeForPull(db, officer.user, intake.id);
    const raw = await inwardRaw(intake.id, pull.values);
    const results = await Promise.allSettled([
      logInward(db, officer, raw),
      logInward(db, officer, raw),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect((failed as PromiseRejectedResult).reason.problems[0]).toMatch(
      /^OGSERC\/FD\/2026\/00001 is already registered as OGSERC\/ACK\/2026\/0000[45]\.$/,
    );
    expect(
      await db.inwardItem.count({ where: { frontDeskIntakeId: intake.id } }),
    ).toBe(1);
  });
});

describe("V7, V8: waiting days and the FD year", () => {
  it("V7: logged 24 Dec, registered 29 Dec → 1 working day", async () => {
    const fd = await at(fdUserId, "2026-12-24", "11:00");
    const { intake } = await logIntake(
      db,
      fd,
      await intakeRaw({ receivedDate: "2026-12-24", receivedTime: "10:00" }),
    );
    const pull = await intakeForPull(db, officer.user, intake.id);
    const reg = await at(ids.users.officer, "2026-12-29", "09:30");
    await logInward(db, reg, await inwardRaw(intake.id, pull.values));
    const [row] = await intakeLog(
      db,
      officer.user,
      {},
      instantIn("2027-01-15", "09:00"),
    );
    expect(row.derived.workingDaysWaiting).toBe(1);
  });

  it("V8: an email at 23:00 on 31 Dec is FD 2026 but ACK 2027", async () => {
    const email = await list("RECEIPT_MODE", "Email");
    const fd = await at(fdUserId, "2026-12-31", "23:05");
    const { intake } = await logIntake(
      db,
      fd,
      await intakeRaw({
        receivedDate: "2026-12-31",
        receivedTime: "23:00",
        modeId: email,
      }),
    );
    expect(intake.intakeNo).toBe("OGSERC/FD/2026/00001");
    const pull = await intakeForPull(db, officer.user, intake.id);
    const reg = await at(ids.users.officer, "2027-01-04", "09:00");
    const { item } = await logInward(
      db,
      reg,
      await inwardRaw(intake.id, pull.values),
    );
    expect(item.number).toBe("OGSERC/ACK/2027/00001");
    expect(item.deemedReceiptDate).toEqual(new Date("2027-01-04"));
  });
});

describe("E7: changing the front desk receipt needs a reason", () => {
  async function pulled() {
    const fd = await at(fdUserId, "2026-12-04", "16:35");
    const { intake } = await logIntake(db, fd, await intakeRaw());
    const pull = await intakeForPull(db, officer.user, intake.id);
    return { intake, pull };
  }

  it("refuses a changed time or mode without a reason, then audits it", async () => {
    const { intake, pull } = await pulled();
    const courier = await list("RECEIPT_MODE", "Courier");
    expect(
      (
        await problemsOf(
          logInward(
            db,
            officer,
            await inwardRaw(intake.id, pull.values, { receivedTime: "15:30" }),
          ),
        )
      ).problems,
    ).toEqual([
      "Reason for changing the front desk receipt time or mode: the receipt time differs from OGSERC/FD/2026/00001, so give a reason.",
    ]);
    expect(
      (
        await problemsOf(
          logInward(
            db,
            officer,
            await inwardRaw(intake.id, pull.values, {
              receivedTime: "15:30",
              modeId: courier,
            }),
          ),
        )
      ).problems,
    ).toEqual([
      "Reason for changing the front desk receipt time or mode: the receipt time and mode differ from OGSERC/FD/2026/00001, so give a reason.",
    ]);
    expect(await db.inwardItem.count()).toBe(3);

    const { item } = await logInward(
      db,
      officer,
      await inwardRaw(intake.id, pull.values, {
        receivedTime: "15:30",
        receiptChangeReason: "Front desk clock was an hour fast",
      }),
    );
    expect(item.receivedAt).toEqual(instantIn("2026-12-04", "15:30"));
    const entry = await db.auditLog.findFirstOrThrow({
      where: { entityId: item.id, action: "receipt-changed-from-intake" },
    });
    expect(entry.note).toBe("Front desk clock was an hour fast");
    expect(entry.before).toEqual({
      intakeNo: "OGSERC/FD/2026/00001",
      receivedAt: instantIn("2026-12-04", "16:30").toISOString(),
    });
    expect(entry.after).toEqual({
      receivedAt: instantIn("2026-12-04", "15:30").toISOString(),
    });
  });

  it("needs no reason when the receipt is unchanged", async () => {
    const { intake, pull } = await pulled();
    const { item } = await logInward(
      db,
      officer,
      await inwardRaw(intake.id, pull.values),
    );
    expect(
      await db.auditLog.count({
        where: { entityId: item.id, action: "receipt-changed-from-intake" },
      }),
    ).toBe(0);
  });
});

describe("Front desk form validation (C3.1, Q-V2-5)", () => {
  it("lists missing fields and refuses a future time", async () => {
    const fd = await at(fdUserId, "2026-12-04", "16:00");
    expect(
      await problemsOf(
        logIntake(db, fd, await intakeRaw({ sender: "", subject: " " })),
      ),
    ).toEqual({
      missing: ["Sender", "Subject"],
      problems: ["Date & time received: can't be in the future."],
    });
    expect(await db.frontDeskIntake.count()).toBe(0);
  });

  it("accepts any mode by default; hand deliveries only when the setting says so", async () => {
    const fd = await at(fdUserId, "2026-12-04", "17:00");
    const email = await list("RECEIPT_MODE", "Email");
    await logIntake(db, fd, await intakeRaw({ modeId: email }));
    await db.registrySettings.update({
      where: { id: 1 },
      data: { frontDeskAnyMode: false },
    });
    expect(
      (await problemsOf(logIntake(db, fd, await intakeRaw({ modeId: email }))))
        .problems,
    ).toEqual(["Mode of receipt: the front desk logs hand deliveries only."]);
    const second = await logIntake(db, fd, await intakeRaw());
    expect(second.intake.intakeNo).toBe("OGSERC/FD/2026/00002");
  });
});

describe("Who may do what (C12)", () => {
  it("only front desk officers log intakes", async () => {
    for (const id of [ids.users.officer, ids.users.head, ids.users.secretary]) {
      const a = await at(id, "2026-12-04", "17:00");
      await expect(logIntake(db, a, await intakeRaw())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("front desk officers can't pull or register, and see only their own intakes in the log", async () => {
    const fd = await at(fdUserId, "2026-12-04", "16:35");
    const other = await at(
      (await makeUser("FRONT_DESK_OFFICER")).id,
      "2026-12-04",
      "16:40",
    );
    const mine = await logIntake(db, fd, await intakeRaw());
    await logIntake(db, other, await intakeRaw({ sender: "Someone else" }));

    await expect(
      intakeForPull(db, fd.user, mine.intake.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      logInward(db, fd, await inwardRaw(mine.intake.id, {})),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // The awaiting-registry list is shared; the log is their own.
    expect(await awaitingRegistry(db, fd.user, DEC_10)).toHaveLength(2);
    const log = await intakeLog(db, fd.user, {}, DEC_10);
    expect(log.map((r) => r.sender)).toEqual(["Verde Solar Ltd"]);
    expect(await intakeLog(db, officer.user, {}, DEC_10)).toHaveLength(2);
  });

  it("admins and unit officers see no intakes", async () => {
    const admin = await makeUser("ADMIN");
    const a = await actorFor(db, admin.id);
    await expect(awaitingRegistry(db, a.user, DEC_10)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(intakeLog(db, a.user, {}, DEC_10)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("filters the log by text, status and dates", async () => {
    const fd = await at(fdUserId, "2026-12-07", "12:00");
    await logIntake(db, fd, await intakeRaw());
    await logIntake(
      db,
      fd,
      await intakeRaw({
        receivedDate: "2026-12-07",
        receivedTime: "11:00",
        sender: "Ogun Mini-Grid",
      }),
    );
    const f = (x: object) =>
      intakeLog(db, officer.user, x, DEC_10).then((r) =>
        r.map((i) => i.sender),
      );
    expect(await f({ q: "ogun" })).toEqual(["Ogun Mini-Grid"]);
    expect(await f({ from: "2026-12-05" })).toEqual(["Ogun Mini-Grid"]);
    expect(await f({ to: "2026-12-04" })).toEqual(["Verde Solar Ltd"]);
    expect(await f({ status: "Registered" })).toEqual([]);
  });
});
