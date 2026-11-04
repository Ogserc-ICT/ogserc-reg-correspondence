// Phase 3 acceptance: roles enforced on the server for reads and writes,
// void and admin rules, login lockout, session expiry, password changes.
import { beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { instantIn } from "@/domain/clock";
import type { Principal } from "@/domain/permissions";
import { createAuth } from "@/server/auth";
import { ForbiddenError, ValidationError } from "@/server/errors";
import {
  getFile,
  getInward,
  getOutward,
  listFiles,
  listInward,
  listOutward,
} from "@/server/queries";
import { createInward, createOutward, voidItem } from "@/server/registers";
import { login, loadPrincipal, sessionUser } from "@/server/session";
import { getSettings, updateSettings } from "@/server/settings";
import {
  changeOwnPassword,
  createUser,
  listUsers,
  setTemporaryPassword,
  unlockUser,
  updateUser,
} from "@/server/users";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-0123",
  baseURL: "http://localhost:3000",
});

const TEMP = "Temporary pass 2026!";
let ids: ExampleIds;
let admin: Principal;
let unitOfficer: Principal;
let regUnitId: string;

async function principalByEmail(email: string) {
  return loadPrincipal(
    db,
    (await db.user.findUniqueOrThrow({ where: { email } })).id,
  );
}

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  // Bootstrap admin, as scripts/create-admin.ts does.
  const a = await db.user.create({
    data: {
      name: "System Admin",
      email: "admin@example.invalid",
      role: "ADMIN",
    },
  });
  admin = await loadPrincipal(db, a.id);
  regUnitId = (
    await db.unit.findUniqueOrThrow({
      where: { name: "Licensing unit" },
    })
  ).id;
  const u = await createUser(
    db,
    admin,
    {
      name: "Unit Reader",
      email: "Unit.Reader@Example.invalid",
      role: "UNIT_OFFICER",
      unitId: regUnitId,
      isSignatory: false,
      designation: null,
      temporaryPassword: TEMP,
    },
    DEC_10,
  );
  unitOfficer = await loadPrincipal(db, u.id);
});

describe("unit officer: own unit only, read-only", () => {
  it("lists only items routed to or originated by their unit", async () => {
    const inward = await listInward(db, unitOfficer);
    expect(inward.map((i) => i.id).sort()).toEqual([ids.I1, ids.I2].sort());
    const outward = await listOutward(db, unitOfficer);
    expect(outward.map((o) => o.id)).toEqual([ids.O1]);
    expect(await listFiles(db, unitOfficer)).toEqual([]);
  });

  it("cannot open another unit's item by id (treated as not found)", async () => {
    expect(await getInward(db, unitOfficer, ids.I3)).toBeNull();
    expect(await getOutward(db, unitOfficer, ids.O2)).toBeNull();
    expect(await getFile(db, unitOfficer, ids.F1)).toBeNull();
    expect((await getInward(db, unitOfficer, ids.I1))?.id).toBe(ids.I1);
  });

  it("no longer sees an item of their unit once it is voided", async () => {
    const head = await principalByEmail("head.registry@example.invalid");
    await db.$transaction((tx) =>
      voidItem(tx, "inward", ids.I2, "Duplicate", { user: head, now: DEC_10 }),
    );
    expect(await getInward(db, unitOfficer, ids.I2)).toBeNull();
  });

  it("cannot write anything, and a refused write leaves no trace", async () => {
    const actor = { user: unitOfficer, now: DEC_10 };
    const i1 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I1 } });
    const o1 = await db.outwardItem.findUniqueOrThrow({
      where: { id: ids.O1 },
    });
    const counts = async () => [
      await db.inwardItem.count(),
      await db.outwardItem.count(),
      (await db.numberCounter.findMany()).map((c) => c.lastValue),
    ];
    const before = await counts();

    await expect(
      db.$transaction((tx) =>
        createInward(
          tx,
          {
            receivedAt: instantIn("2026-12-10", "10:00"),
            modeId: i1.modeId,
            typeId: i1.typeId,
            sender: "X",
            senderCategoryId: i1.senderCategoryId,
            subject: "X",
            receivedById: unitOfficer.id,
            ackIssuedViaId: i1.ackIssuedViaId,
            actionRequiredId: i1.actionRequiredId,
          },
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      db.$transaction((tx) =>
        createOutward(
          tx,
          {
            documentDate: "2026-12-10",
            typeId: o1.typeId,
            subject: "X",
            addressee: "X",
            recipientCategoryId: o1.recipientCategoryId,
            originatingUnitId: regUnitId,
            signedByText: "X",
            signatoryDesignation: "X",
            dispatchModeId: o1.dispatchModeId,
          },
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      db.$transaction((tx) => voidItem(tx, "inward", ids.I1, "No", actor)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateSettings(db, unitOfficer, {}, DEC_10),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listUsers(db, unitOfficer)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(await counts()).toEqual(before);
  });
});

describe("void: Head of Registry only", () => {
  it("refuses officers, secretaries, unit officers and admins", async () => {
    for (const email of [
      "registry.officer1@example.invalid",
      "secretary@example.invalid",
      "admin@example.invalid",
      "unit.reader@example.invalid",
    ]) {
      const user = await principalByEmail(email);
      await expect(
        db.$transaction((tx) =>
          voidItem(tx, "outward", ids.O2, "Test", { user, now: DEC_10 }),
        ),
      ).rejects.toThrow("Only the Head of Registry");
    }
    const o2 = await db.outwardItem.findUniqueOrThrow({
      where: { id: ids.O2 },
    });
    expect(o2.voidedAt).toBeNull();
  });

  it("lets the head void others' items but not their own, unless the setting allows it", async () => {
    const head = await principalByEmail("head.registry@example.invalid");
    await db.$transaction((tx) =>
      voidItem(tx, "outward", ids.O2, "Wrong letter", {
        user: head,
        now: DEC_10,
      }),
    );

    await db.inwardItem.updateMany({
      where: { id: ids.I3 },
      data: { createdById: head.id },
    });
    await expect(
      db.$transaction((tx) =>
        voidItem(tx, "inward", ids.I3, "Mine", { user: head, now: DEC_10 }),
      ),
    ).rejects.toThrow("another Head of Registry");

    await db.registrySettings.update({
      where: { id: 1 },
      data: { headMayVoidOwnItems: true },
    });
    await db.$transaction((tx) =>
      voidItem(tx, "inward", ids.I3, "Mine", { user: head, now: DEC_10 }),
    );
    const i3 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I3 } });
    expect(i3.voidReason).toBe("Mine");
  });
});

describe("users and settings: Admin only", () => {
  it("refuses the Head of Registry", async () => {
    const head = await principalByEmail("head.registry@example.invalid");
    await expect(listUsers(db, head)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getSettings(db, head)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      unlockUser(db, head, unitOfficer.id, DEC_10),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setTemporaryPassword(db, head, unitOfficer.id, TEMP, DEC_10),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("gives admins no access to the registers", async () => {
    expect(await listInward(db, admin)).toEqual([]);
    expect(await listOutward(db, admin)).toEqual([]);
    expect(await getInward(db, admin, ids.I1)).toBeNull();
  });

  it("validates and audits a settings change with old and new values", async () => {
    const s = await getSettings(db, admin);
    await expect(
      updateSettings(db, admin, { ...s, officeClosingTime: "5pm" }, DEC_10),
    ).rejects.toBeInstanceOf(ValidationError);
    await updateSettings(
      db,
      admin,
      { ...s, officeClosingTime: "16:30", secretaryName: "A. Bello" },
      DEC_10,
    );
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "settings-update" },
    });
    expect(log.userId).toBe(admin.id);
    expect(log.before).toEqual({
      officeClosingTime: "17:00",
      secretaryName: "",
    });
    expect(log.after).toEqual({
      officeClosingTime: "16:30",
      secretaryName: "A. Bello",
    });
  });

  it("checks role/unit pairs, unique emails and password rules", async () => {
    const base = {
      name: "New Person",
      email: "new.person@example.invalid",
      role: "UNIT_OFFICER" as const,
      unitId: null,
      isSignatory: false,
      designation: null,
      temporaryPassword: TEMP,
    };
    await expect(createUser(db, admin, base, DEC_10)).rejects.toThrow(
      "needs a unit",
    );
    await expect(
      createUser(
        db,
        admin,
        { ...base, unitId: regUnitId, email: "UNIT.READER@example.invalid" },
        DEC_10,
      ),
    ).rejects.toThrow("already has an account");
    await expect(
      createUser(
        db,
        admin,
        { ...base, unitId: regUnitId, temporaryPassword: "short" },
        DEC_10,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("never removes the last active admin", async () => {
    await expect(
      updateUser(
        db,
        admin,
        admin.id,
        {
          name: "System Admin",
          email: "admin@example.invalid",
          role: "ADMIN",
          unitId: null,
          isSignatory: false,
          designation: null,
          active: false,
        },
        DEC_10,
      ),
    ).rejects.toThrow("only active admin");
  });

  it("keeps passwords out of the audit log", async () => {
    const entries = await db.auditLog.findMany({
      where: { entityType: "User" },
    });
    const stored = entries.map((e) => [e.before, e.after, e.note]);
    expect(JSON.stringify(stored)).not.toContain(TEMP);
    const account = await db.account.findFirstOrThrow({
      where: { userId: unitOfficer.id },
    });
    expect(account.password).toMatch(/^\$argon2id\$/);
  });
});

describe("login", () => {
  const email = "unit.reader@example.invalid";
  const attempt = (password: string, now = DEC_10) =>
    login(db, auth, { email, password, headers: new Headers() }, now);
  const cookieOf = (h: Headers) => (h.get("set-cookie") ?? "").split(";")[0];

  it("signs in with the temporary password and must change it", async () => {
    const r = await attempt(TEMP);
    expect(r.ok && r.mustChangePassword).toBe(true);
    if (!r.ok) return;
    const me = await sessionUser(
      db,
      auth,
      new Headers({ cookie: cookieOf(r.headers) }),
    );
    expect(me).toMatchObject({
      id: unitOfficer.id,
      role: "UNIT_OFFICER",
      unitId: regUnitId,
    });
  });

  it("locks the account for 15 minutes after 5 failures in a row", async () => {
    for (let i = 0; i < 4; i++)
      expect((await attempt("wrong password 1")).ok).toBe(false);
    const fifth = await attempt("wrong password 1");
    expect(fifth).toEqual({
      ok: false,
      error: "Email or password is incorrect.",
    });

    const blocked = await attempt(
      TEMP,
      new Date(DEC_10.getTime() + 14 * 60_000),
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/Too many failed attempts/);

    expect(
      (await attempt(TEMP, new Date(DEC_10.getTime() + 16 * 60_000))).ok,
    ).toBe(true);
    const row = await db.user.findUniqueOrThrow({ where: { email } });
    expect(row).toMatchObject({ failedLogins: 0, lockedUntil: null });
    const actions = (
      await db.auditLog.findMany({
        where: { entityId: row.id },
        orderBy: { id: "asc" },
      })
    )
      .map((l) => l.action)
      .filter((a) => a.startsWith("login") || a === "lockout");
    expect(actions).toEqual([
      "login-failed",
      "login-failed",
      "login-failed",
      "login-failed",
      "lockout",
      "login-blocked",
      "login",
    ]);
  });

  it("lets an admin unlock early", async () => {
    for (let i = 0; i < 5; i++) await attempt("wrong password 1");
    await unlockUser(db, admin, unitOfficer.id, DEC_10);
    expect((await attempt(TEMP)).ok).toBe(true);
  });

  it("rejects unknown emails with the same message", async () => {
    const r = await login(
      db,
      auth,
      {
        email: "nobody@example.invalid",
        password: TEMP,
        headers: new Headers(),
      },
      DEC_10,
    );
    expect(r).toEqual({ ok: false, error: "Email or password is incorrect." });
  });

  it("ends sessions when a user is deactivated, and blocks their sign-in", async () => {
    const r = await attempt(TEMP);
    if (!r.ok) throw new Error("login failed");
    const cookie = new Headers({ cookie: cookieOf(r.headers) });
    await updateUser(
      db,
      admin,
      unitOfficer.id,
      {
        name: "Unit Reader",
        email,
        role: "UNIT_OFFICER",
        unitId: regUnitId,
        isSignatory: false,
        designation: null,
        active: false,
      },
      DEC_10,
    );
    expect(await sessionUser(db, auth, cookie)).toBeNull();
    expect((await attempt(TEMP)).ok).toBe(false);
  });

  it("expires sessions", async () => {
    const r = await attempt(TEMP);
    if (!r.ok) throw new Error("login failed");
    const cookie = new Headers({ cookie: cookieOf(r.headers) });
    expect(await sessionUser(db, auth, cookie)).not.toBeNull();
    await db.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await sessionUser(db, auth, cookie)).toBeNull();
  });

  it("changes the user's own password", async () => {
    await expect(
      changeOwnPassword(
        db,
        unitOfficer,
        { current: "not it at all 1", next: "Brand new phrase 77" },
        DEC_10,
      ),
    ).rejects.toThrow("current password");
    await expect(
      changeOwnPassword(
        db,
        unitOfficer,
        { current: TEMP, next: "weak" },
        DEC_10,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await changeOwnPassword(
      db,
      unitOfficer,
      { current: TEMP, next: "Brand new phrase 77" },
      DEC_10,
    );
    expect((await attempt(TEMP)).ok).toBe(false);
    const r = await attempt("Brand new phrase 77");
    expect(r.ok && r.mustChangePassword).toBe(false);
  });
});

it("actorFor builds principals from the DB", async () => {
  const a = await actorFor(db, admin.id);
  expect(a.user.role).toBe("ADMIN");
});
