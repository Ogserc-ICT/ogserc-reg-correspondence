// SPEC §3.2 and N3: numbers come from the counter inside the insert
// transaction; concurrent saves never share or skip a number.
import { beforeEach, describe, expect, it } from "vitest";
import { instantIn } from "@/domain/clock";
import { nextNumber } from "@/server/numbers";
import { createInward, type NewInward } from "@/server/registers";
import type { Db } from "@/server/db";
import { DEC_10, resetDb, connectTestDb } from "./helpers";

const db = connectTestDb();

async function inwardInput(db: Db, receivedAt: Date, mode = "Hand delivery") {
  const list = async (
    list: "RECEIPT_MODE" | "PARTY_CATEGORY" | "ACK_VIA" | "ACTION_REQUIRED",
    label: string,
  ) => (await db.listItem.findFirstOrThrow({ where: { list, label } })).id;
  const officer = await db.user.upsert({
    where: { email: "officer@example.invalid" },
    update: {},
    create: {
      name: "Officer",
      email: "officer@example.invalid",
      role: "REGISTRY_OFFICER",
    },
  });
  const input: NewInward = {
    receivedAt,
    modeId: await list("RECEIPT_MODE", mode),
    typeId: (
      await db.incomingType.findFirstOrThrow({
        where: { name: "Other correspondence" },
      })
    ).id,
    sender: "Sender",
    senderCategoryId: await list("PARTY_CATEGORY", "Other"),
    subject: "Subject",
    receivedById: officer.id,
    ackIssuedViaId: await list("ACK_VIA", "Printed slip"),
    actionRequiredId: await list("ACTION_REQUIRED", "Action required"),
  };
  return { input, actor: { userId: officer.id, now: DEC_10 } };
}

describe("number service", () => {
  beforeEach(() => resetDb(db));

  it("N3: 20 concurrent saves in 2026 get 00001–00020, no gaps, no duplicates", async () => {
    const { input, actor } = await inwardInput(
      db,
      instantIn("2026-12-01", "10:00"),
    );
    const items = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.$transaction((tx) => createInward(tx, input, actor), {
          maxWait: 20_000,
          timeout: 20_000,
        }),
      ),
    );
    const numbers = items.map((i) => i.number).sort();
    expect(numbers).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `OGSERC/ACK/2026/${String(i + 1).padStart(5, "0")}`,
      ),
    );
    expect(
      await db.numberCounter.findUnique({
        where: { series_year: { series: "ACK", year: 2026 } },
      }),
    ).toMatchObject({ lastValue: 20 });
  });

  it("gives the number back when the saving transaction fails", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await nextNumber("ACK", 2026, tx);
        throw new Error("validation failed after numbering");
      }),
    ).rejects.toThrow("validation failed");
    const n = await db.$transaction((tx) => nextNumber("ACK", 2026, tx));
    expect(n.number).toBe("OGSERC/ACK/2026/00001");
  });

  it("restarts each year per series, taking the year from the deemed date (D8)", async () => {
    const { input, actor } = await inwardInput(
      db,
      instantIn("2026-12-31", "17:30"),
      "Email",
    );
    await db.$transaction((tx) => nextNumber("ACK", 2026, tx));
    const item = await db.$transaction((tx) => createInward(tx, input, actor));
    expect(item.number).toBe("OGSERC/ACK/2027/00001");
    const out = await db.$transaction((tx) => nextNumber("OUT", 2026, tx));
    expect(out.number).toBe("OGSERC/OUT/2026/00001");
  });

  it("takes the prefix from settings", async () => {
    await db.registrySettings.update({
      where: { id: 1 },
      data: { ackPrefix: "OGSERC/REG" },
    });
    const n = await db.$transaction((tx) => nextNumber("ACK", 2026, tx));
    expect(n.number).toBe("OGSERC/REG/2026/00001");
  });

  it("snapshots the type and deemed date, routes, caches status and audits", async () => {
    const { input, actor } = await inwardInput(
      db,
      instantIn("2026-11-30", "18:40"),
      "Email",
    );
    const item = await db.$transaction((tx) => createInward(tx, input, actor));
    const row = await db.inwardItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    const type = await db.incomingType.findUniqueOrThrow({
      where: { id: input.typeId },
    });
    expect(row.deemedReceiptDate.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(row).toMatchObject({
      snapTypeName: "Other correspondence",
      snapResponseTargetDays: 10,
      snapClosingTime: "17:00",
      routedUnitId: type.defaultUnitId,
      statusCache: "AWAITING_FORWARDING",
    });
    const log = await db.auditLog.findMany({ where: { entityId: item.id } });
    expect(log.map((l) => l.action)).toEqual(["create"]);
    expect(log[0].userId).toBe(actor.userId);
  });
});
