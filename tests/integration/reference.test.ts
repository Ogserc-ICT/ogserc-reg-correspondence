// Phase 8 reference data: types, lists, units and holidays, edited by the
// Head of Registry; history never rewritten; holidays move open deadlines.
import { beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { inwardDetail } from "@/server/read/items";
import {
  deleteHoliday,
  saveHoliday,
  saveIncomingType,
  saveListItem,
  saveUnit,
} from "@/server/reference";
import type { Actor } from "@/server/registers";
import { logInward } from "@/server/workflows/inward";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let head: Actor;
let officer: Actor;

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  head = await actorFor(db, ids.users.head);
  officer = await actorFor(db, ids.users.officer);
});

const typeRaw = async (name: string, over: Record<string, string> = {}) => {
  const t = await db.incomingType.findUniqueOrThrow({ where: { name } });
  return {
    id: t.id,
    raw: {
      name: t.name,
      category: t.category,
      defaultUnitId: t.defaultUnitId,
      orderRef: t.orderRef ?? "",
      responseTargetDays: String(t.responseTargetDays),
      ...(t.para103SlipWording ? { para103SlipWording: "on" } : {}),
      slipFooter: t.slipFooter,
      ...(t.isRegistration ? { isRegistration: "on" } : {}),
      ...(t.requiresRelatedOgsercNo ? { requiresRelatedOgsercNo: "on" } : {}),
      active: "on",
      sortOrder: String(t.sortOrder),
      ...over,
    },
  };
};

describe("incoming types", () => {
  it("changes the rules for new items only (STACK rule 10)", async () => {
    const { id, raw } = await typeRaw("Deficiency response", {
      responseTargetDays: "5",
    });
    await saveIncomingType(db, head, id, raw);
    // I2, already logged, keeps its 10-day target: due 15 Dec.
    expect(
      (await inwardDetail(db, head.user, ids.I2, DEC_10))?.derived.responseDue,
    ).toBe("2026-12-15");
    const list = async (l: string, label: string) =>
      (
        await db.listItem.findFirstOrThrow({
          where: { list: l as never, label },
        })
      ).id;
    const { item } = await logInward(db, officer, {
      receivedDate: "2026-12-10",
      receivedTime: "08:00",
      modeId: await list("RECEIPT_MODE", "Hand delivery"),
      typeId: id,
      sender: "Sample Mini-Grid Ltd",
      senderCategoryId: await list("PARTY_CATEGORY", "Registrant / licensee"),
      subject: "Second response",
      relatedOgsercNo: "ACK/2026/00001",
      receivedById: officer.user.id,
      ackIssuedViaId: await list("ACK_VIA", "Printed slip"),
      actionRequiredId: await list("ACTION_REQUIRED", "Action required"),
    });
    expect(item.snapResponseTargetDays).toBe(5);
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: id } });
    expect(log).toMatchObject({
      action: "reference-update",
      before: { responseTargetDays: 10 },
      after: { responseTargetDays: 5 },
    });
  });

  it("refuses a duplicate name and anyone but the Head of Registry", async () => {
    const { raw } = await typeRaw("Consumer complaint", {
      name: "consumer COMPLAINT",
    });
    await expect(saveIncomingType(db, head, null, raw)).rejects.toThrow(
      "already a type called",
    );
    await expect(
      saveIncomingType(db, officer, null, raw),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("lists and units", () => {
  it("renames a value the rules use, but won't switch it off", async () => {
    const info = await db.listItem.findFirstOrThrow({
      where: { systemKey: "FOR_INFORMATION" },
    });
    await saveListItem(db, head, "ACTION_REQUIRED", info.id, {
      label: "For information only",
      active: "on",
      sortOrder: "2",
    });
    expect(
      (await db.listItem.findUniqueOrThrow({ where: { id: info.id } }))
        .systemKey,
    ).toBe("FOR_INFORMATION");
    await expect(
      saveListItem(db, head, "ACTION_REQUIRED", info.id, {
        label: "For information only",
      }),
    ).rejects.toThrow("can be renamed but not switched off");
  });

  it("adds a receipt mode with its own cut-off rule", async () => {
    await saveListItem(db, head, "RECEIPT_MODE", null, {
      label: "WhatsApp",
      active: "on",
      afterHoursCutoff: "on",
      sortOrder: "9",
    });
    const m = await db.listItem.findFirstOrThrow({
      where: { label: "WhatsApp" },
    });
    expect(m).toMatchObject({
      afterHoursCutoff: true,
      noDeliveryConfirmation: false,
    });
  });

  it("won't switch off a unit that types still route to", async () => {
    const unit = await db.unit.findUniqueOrThrow({
      where: { name: "Licensing unit" },
    });
    await expect(
      saveUnit(db, head, unit.id, { name: unit.name, sortOrder: "2" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("public holidays", () => {
  it("moves open deadlines when a holiday is added, and back when removed", async () => {
    const due = async () =>
      (await inwardDetail(db, head.user, ids.I2, DEC_10))?.derived.responseDue;
    expect(await due()).toBe("2026-12-15");
    const r = await saveHoliday(db, head, null, {
      date: "2026-12-14",
      name: "State holiday (declared)",
      status: "FIXED",
    });
    expect(r.message).toContain("Deadlines have been recalculated");
    expect(await due()).toBe("2026-12-16");
    const runs = await db.jobRun.findMany({ where: { job: "refresh-status" } });
    expect(runs).toHaveLength(1);

    await expect(
      saveHoliday(db, head, null, {
        date: "2026-12-14",
        name: "Again",
        status: "FIXED",
      }),
    ).rejects.toThrow("already a holiday");

    const h = await db.publicHoliday.findUniqueOrThrow({
      where: { date: new Date("2026-12-14T00:00:00Z") },
    });
    await deleteHoliday(db, head, h.id);
    expect(await due()).toBe("2026-12-15");
    expect(
      await db.auditLog.count({ where: { entityType: "PublicHoliday" } }),
    ).toBe(2);
  });
});
