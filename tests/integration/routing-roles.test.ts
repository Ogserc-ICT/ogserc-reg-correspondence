// V3 (SPEC-v2 C5, C12): routing is a per-user flag (User.canRoute) that
// grants registry.route and nothing else; the Front desk officer role; and
// the database protections for intakes, routing history and file references.
import { beforeEach, describe, expect, it } from "vitest";
import {
  seedDevLogins,
  seedExample,
  type ExampleIds,
} from "../../prisma/seed/example";
import { ROUTING_REFUSED } from "@/domain/routing";
import type { Role } from "@/domain/permissions";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { fileDetail, fileIndex } from "@/server/read/files";
import { inwardRegister } from "@/server/read/registers";
import { loadPrincipal } from "@/server/session";
import { updateUser } from "@/server/users";
import { loadForRouting, routeInward } from "@/server/workflows/routing";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;

const unitId = async (name: string) =>
  (await db.unit.findUniqueOrThrow({ where: { name } })).id;
const listId = async (list: string, label: string) =>
  (
    await db.listItem.findFirstOrThrow({
      where: { list: list as never, label },
    })
  ).id;

async function makeUser(
  role: Role,
  opts: { canRoute?: boolean; unit?: string; email?: string } = {},
) {
  return db.user.create({
    data: {
      name: `${role} ${opts.canRoute ? "router" : "user"}`,
      email:
        opts.email ??
        `${role.toLowerCase()}.${Math.random().toString(36).slice(2)}@ogserc.test`,
      role,
      unitId: opts.unit ? await unitId(opts.unit) : null,
      canRoute: opts.canRoute ?? false,
    },
  });
}

/** The six routing fields as the Routing Desk form sends them. */
async function routingForm(over: Record<string, string> = {}) {
  return {
    unitOverrideId: "",
    fileId: "",
    actionRequiredId: await listId("ACTION_REQUIRED", "Action required"),
    priorityId: "",
    actionOfficer: "",
    responseDueOverride: "",
    ...over,
  };
}

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
});

describe("canRoute: routing without any other access (C5.1, C12)", () => {
  it("a user with canRoute but not the Secretary role can route, and sees no Confidential or Personnel file", async () => {
    // A registry officer who routes: files.read, but not confidential files.
    const u = await makeUser("REGISTRY_OFFICER", { canRoute: true });
    const router = await actorFor(db, u.id);
    const officer = await actorFor(db, ids.users.officer);

    const r = await routeInward(db, router, ids.I2, await routingForm());
    expect(r.status).toBe("Awaiting forwarding");

    const security = await listId("FILE_SECURITY", "Confidential");
    const open = await listId("FILE_SECURITY", "Open");
    const status = await listId("FILE_STATUS", "Open");
    const personnelClass = await db.listItem.findFirstOrThrow({
      where: { list: "FILE_CLASS", systemKey: "PERSONNEL" },
    });
    const conf = await db.registryFile.create({
      data: {
        reference: "OGSERC/GEN/009",
        title: "Confidential matter",
        dateOpened: new Date("2026-11-02"),
        securityId: security,
        fileStatusId: status,
        createdById: ids.users.officer,
      },
    });
    const pf = await db.registryFile.create({
      data: {
        reference: "OGSERC/PF/001",
        title: "Staff file",
        fileClassId: personnelClass.id,
        dateOpened: new Date("2026-11-02"),
        securityId: open,
        fileStatusId: status,
        createdById: ids.users.officer,
      },
    });
    const refs = (await fileIndex(db, router.user, {}, DEC_10)).rows.map(
      (f) => f.reference,
    );
    expect(refs).not.toContain("OGSERC/GEN/009");
    expect(refs).not.toContain("OGSERC/PF/001");
    expect(await fileDetail(db, router.user, conf.id, DEC_10)).toBeNull();
    expect(await fileDetail(db, router.user, pf.id, DEC_10)).toBeNull();
    // ...exactly as for the same role without the flag.
    expect(
      (await fileIndex(db, officer.user, {}, DEC_10)).rows.map(
        (f) => f.reference,
      ),
    ).toEqual(refs);
  });

  it("the Head of Administration (a unit officer who routes) gets the Routing Desk only", async () => {
    const u = await makeUser("UNIT_OFFICER", {
      canRoute: true,
      unit: "Administration",
    });
    const hoa = await actorFor(db, u.id);
    // Routing Desk: any item, for routing.
    const desk = await loadForRouting(db, hoa, ids.I2);
    expect(desk).toMatchObject({
      number: "OGSERC/ACK/2026/00002",
      status: "Awaiting routing",
      unit: "Licensing unit",
      division: "Legal, Licensing and Consumer Affairs",
      blocker: null,
    });
    // Registers: still only the Administration unit's items (none).
    expect((await inwardRegister(db, hoa.user, {}, DEC_10)).rows).toEqual([]);
    // Files and writes: still refused.
    await expect(fileIndex(db, hoa.user, {}, DEC_10)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("a user without canRoute cannot open the Routing Desk or call routeInward, whatever the role", async () => {
    const roles: Role[] = [
      "REGISTRY_OFFICER",
      "HEAD_OF_REGISTRY",
      "UNIT_OFFICER",
      "SECRETARY",
      "ADMIN",
      "FRONT_DESK_OFFICER",
    ];
    const form = await routingForm();
    for (const role of roles) {
      const u = await makeUser(role, {
        unit: role === "UNIT_OFFICER" ? "Licensing unit" : undefined,
      });
      const a = await actorFor(db, u.id);
      await expect(loadForRouting(db, a, ids.I2)).rejects.toThrow(
        ROUTING_REFUSED,
      );
      await expect(routeInward(db, a, ids.I2, form)).rejects.toThrow(
        ROUTING_REFUSED,
      );
    }
    // The seeded Chairman has the Secretary role but no flag.
    const chairman = await actorFor(db, ids.users.chairman);
    await expect(
      routeInward(db, chairman, ids.I2, form),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2.routedAt).toBeNull();
    expect(
      await db.routingEvent.count({ where: { inwardItemId: ids.I2 } }),
    ).toBe(0);
  });

  it("changing canRoute is audited and takes effect on the next request", async () => {
    await seedDevLogins(db);
    const admin = await loadPrincipal(
      db,
      (
        await db.user.findUniqueOrThrow({
          where: { email: "admin@example.invalid" },
        })
      ).id,
    );
    const u = await makeUser("REGISTRY_OFFICER");
    const form = await routingForm();
    const input = {
      name: u.name,
      email: u.email,
      role: u.role,
      unitId: null,
      isSignatory: false,
      designation: null,
      active: true,
    };
    await expect(
      routeInward(db, await actorFor(db, u.id), ids.I2, form),
    ).rejects.toThrow(ROUTING_REFUSED);

    await updateUser(db, admin, u.id, { ...input, canRoute: true }, DEC_10);
    // Next request: the principal is read from the database again.
    const r = await routeInward(db, await actorFor(db, u.id), ids.I2, form);
    expect(r.message).toMatch(
      /^OGSERC\/ACK\/2026\/00002 routed to Licensing unit by /,
    );

    await updateUser(db, admin, u.id, { ...input, canRoute: false }, DEC_10);
    await expect(
      routeInward(db, await actorFor(db, u.id), ids.I2, form),
    ).rejects.toThrow(ROUTING_REFUSED);

    const log = await db.auditLog.findMany({
      where: { entityId: u.id, action: "user-update" },
      orderBy: { id: "asc" },
    });
    expect(log.map((l) => [l.userId, l.before, l.after])).toEqual([
      [admin.id, { canRoute: false }, { canRoute: true }],
      [admin.id, { canRoute: true }, { canRoute: false }],
    ]);
  });
});

describe("routeInward (C5.2, C13.2)", () => {
  it("V2: the Secretary routes I2 → Awaiting forwarding, routed by and at, one history row", async () => {
    const sec = await actorFor(db, ids.users.secretary);
    // The Routing Desk form comes prefilled with the item's current values.
    const { fileId } = await db.inwardItem.findUniqueOrThrow({
      where: { id: ids.I2 },
    });
    const r = await routeInward(
      db,
      sec,
      ids.I2,
      await routingForm({ fileId: fileId! }),
    );
    expect(r.message).toBe(
      "OGSERC/ACK/2026/00002 routed to Licensing unit by Secretary to the Commission.\nStatus: Awaiting forwarding",
    );
    const i2 = await db.inwardItem.findUniqueOrThrow({
      where: { id: ids.I2 },
      include: { routingEvents: true },
    });
    expect(i2).toMatchObject({
      statusCache: "AWAITING_FORWARDING",
      routedById: ids.users.secretary,
      routedAt: DEC_10,
    });
    expect(i2.routingEvents).toHaveLength(1);
    expect(i2.routingEvents[0].after).toEqual({
      actionRequiredId: {
        id: await listId("ACTION_REQUIRED", "Action required"),
        label: "Action required",
      },
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: ids.I2, action: "route" },
    });
    expect(audit.userId).toBe(ids.users.secretary);
  });

  it("V3: re-routing to ICT unit keeps the history (2 events)", async () => {
    const sec = await actorFor(db, ids.users.secretary);
    await routeInward(db, sec, ids.I2, await routingForm());
    const r = await routeInward(
      db,
      sec,
      ids.I2,
      await routingForm({ unitOverrideId: await unitId("ICT unit") }),
    );
    expect(r.message).toMatch(/routed to ICT unit by/);
    const events = await db.routingEvent.findMany({
      where: { inwardItemId: ids.I2 },
      orderBy: { routedAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[1].before).toEqual({ unitOverrideId: null });
    expect(events[1].after).toMatchObject({
      unitOverrideId: { label: "ICT unit" },
    });
    const desk = await loadForRouting(db, sec, ids.I2);
    expect(desk.history).toHaveLength(2);
    expect(desk.unit).toBe("ICT unit");
    expect(desk.division).toBe("Financial Management Services");
  });

  it("V5: a Closed item (I1) or a Void item is refused; action required is required", async () => {
    const sec = await actorFor(db, ids.users.secretary);
    await expect(
      routeInward(db, sec, ids.I1, await routingForm()),
    ).rejects.toThrow("OGSERC/ACK/2026/00001 is closed and cannot be routed.");
    expect((await loadForRouting(db, sec, ids.I1)).blocker).toMatch(/closed/);
    await expect(
      routeInward(db, sec, ids.I2, await routingForm({ actionRequiredId: "" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("Q-V2-3: with the setting on, routing needs the router's password", async () => {
    await seedDevLogins(db);
    await db.registrySettings.update({
      where: { id: 1 },
      data: { routingRequiresPassword: true },
    });
    const sec = await actorFor(db, ids.users.secretary);
    const form = await routingForm();
    await expect(routeInward(db, sec, ids.I2, form)).rejects.toThrow(
      "Re-enter your password",
    );
    await expect(
      routeInward(db, sec, ids.I2, form, { password: "wrong" }),
    ).rejects.toThrow("Re-enter your password");
    const r = await routeInward(db, sec, ids.I2, form, {
      password: process.env.DEV_SEED_PASSWORD || "Dev only pass 2026!",
    });
    expect(r.status).toBe("Awaiting forwarding");
  });
});

describe("Front desk officer (C12)", () => {
  it("reads no inward or outward items", async () => {
    const fd = await actorFor(db, (await makeUser("FRONT_DESK_OFFICER")).id);
    expect((await inwardRegister(db, fd.user, {}, DEC_10)).rows).toEqual([]);
    await expect(fileIndex(db, fd.user, {}, DEC_10)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("database protections (C3, C5, C8)", () => {
  async function intake(serial: number) {
    const officer = await makeUser("FRONT_DESK_OFFICER");
    return db.frontDeskIntake.create({
      data: {
        intakeNo: `OGSERC/FD/2026/${String(serial).padStart(5, "0")}`,
        intakeYear: 2026,
        serial,
        receivedAt: new Date("2026-12-04T15:30:00Z"),
        sender: "Sample sender",
        subject: "Sample subject",
        modeId: await listId("RECEIPT_MODE", "Hand delivery"),
        receivedById: officer.id,
      },
    });
  }

  it("E8: one intake registers one inward item, and the link never changes", async () => {
    const fd = await intake(1);
    await db.inwardItem.update({
      where: { id: ids.I2 },
      data: { frontDeskIntakeId: fd.id },
    });
    await expect(
      db.inwardItem.update({
        where: { id: ids.I1 },
        data: { frontDeskIntakeId: fd.id },
      }),
    ).rejects.toThrow();
    const other = await intake(2);
    await expect(
      db.inwardItem.update({
        where: { id: ids.I2 },
        data: { frontDeskIntakeId: other.id },
      }),
    ).rejects.toThrow(/cannot be changed/);
  });

  it("intake numbers never change; intakes are never deleted", async () => {
    const fd = await intake(1);
    await expect(
      db.frontDeskIntake.update({
        where: { id: fd.id },
        data: { intakeNo: "OGSERC/FD/2026/00099" },
      }),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      db.frontDeskIntake.delete({ where: { id: fd.id } }),
    ).rejects.toThrow(/cannot be deleted/);
    await db.frontDeskIntake.update({
      where: { id: fd.id },
      data: { registeredAt: DEC_10 },
    });
    await expect(
      db.frontDeskIntake.update({
        where: { id: fd.id },
        data: { registeredAt: new Date() },
      }),
    ).rejects.toThrow(/already registered/);
  });

  it("E4: routing history is append-only", async () => {
    const e = await db.routingEvent.findFirstOrThrow({
      where: { inwardItemId: ids.I3 },
    });
    await expect(
      db.routingEvent.update({ where: { id: e.id }, data: { after: {} } }),
    ).rejects.toThrow(/not allowed/);
    await expect(
      db.routingEvent.delete({ where: { id: e.id } }),
    ).rejects.toThrow(/not allowed/);
  });

  it("V9: file references are unique ignoring case", async () => {
    const f = await db.registryFile.findFirstOrThrow({
      where: { reference: "OGSERC/RL/001" },
    });
    await expect(
      db.registryFile.create({
        data: {
          reference: "ogserc/rl/001",
          title: "Duplicate",
          dateOpened: new Date("2026-11-02"),
          securityId: f.securityId,
          fileStatusId: f.fileStatusId,
          createdById: ids.users.officer,
        },
      }),
    ).rejects.toThrow();
  });
});
