// File Desk (SPEC §6, §7): F1 and F2 on 10 Dec 2026, issue / return rules,
// the "still out — issue anyway?" confirmation and permissions.
import { beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { instantIn } from "@/domain/clock";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { fileDetail, fileIndex, movementLog } from "@/server/read/files";
import type { Actor } from "@/server/registers";
import { FormProblems } from "@/server/workflows/common";
import {
  createFile,
  issueFile,
  recordReturn,
  StillOut,
  updateFile,
} from "@/server/workflows/files";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let officer: Actor;

const at = (a: Actor, date: string, time = "09:00"): Actor => ({
  ...a,
  now: instantIn(date, time),
});
const unit = async (name: string) =>
  (await db.unit.findUniqueOrThrow({ where: { name } })).id;
const list = async (l: string, label: string) =>
  (await db.listItem.findFirstOrThrow({ where: { list: l as never, label } }))
    .id;

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  officer = await actorFor(db, ids.users.officer);
});

describe("F1 and F2 on 10 Dec 2026", () => {
  it("F1: back with the Registry; 2 inward, 1 outward, last correspondence 1 Dec", async () => {
    const d = await fileDetail(db, officer.user, ids.F1, DEC_10);
    expect(d?.derived).toMatchObject({
      inwardCount: 2,
      outwardCount: 1,
      lastCorrespondence: "2026-12-01",
      currentlyWith: "Registry",
      isOut: false,
      flags: [],
    });
    expect(d?.movements[0].derived).toMatchObject({
      returnDue: "2026-11-25",
      workingDaysOut: 3,
      status: "Returned",
    });
  });

  it("F2: overdue with the PA to Chairman, 6 working days out", async () => {
    const d = await fileDetail(db, officer.user, ids.F2, DEC_10);
    expect(d?.derived).toMatchObject({
      currentlyWith:
        "PA to Chairman (Office of the General Counsel and Secretary (Registry))",
      outSince: "2026-12-02",
      workingDaysOut: 6,
      flags: ["Out beyond return date"],
    });
    expect(d?.movements[0].derived).toMatchObject({
      returnDue: "2026-12-07",
      status: "Overdue",
    });
  });

  it("filters the File Index and the movement log", async () => {
    const refs = async (f: object) =>
      (await fileIndex(db, officer.user, f, DEC_10)).rows.map(
        (r) => r.reference,
      );
    expect(await refs({})).toEqual(["OGSERC/GOV/001", "OGSERC/RL/001"]);
    expect(await refs({ out: true })).toEqual(["OGSERC/GOV/001"]);
    expect(await refs({ overdue: true })).toEqual(["OGSERC/GOV/001"]);
    expect(await refs({ q: "mini-grid" })).toEqual(["OGSERC/RL/001"]);
    const log = await movementLog(db, officer.user, "Overdue", DEC_10);
    expect(log.map((m) => m.file.reference)).toEqual(["OGSERC/GOV/001"]);
  });
});

describe("New file", () => {
  it("adds a file with defaults and refuses a reference already used", async () => {
    const r = await createFile(db, at(officer, "2026-12-10"), {
      reference: " ogserc/rl/002 ",
      title: "Second licensee",
    });
    expect(r.message).toBe("OGSERC/RL/002 added to the File Index.");
    expect(r.file).toMatchObject({
      reference: "OGSERC/RL/002",
      currentVolume: 1,
    });
    expect(r.file.dateOpened.toISOString().slice(0, 10)).toBe("2026-12-10");
    await expect(
      createFile(db, officer, { reference: "OGSERC/RL/001", title: "Again" }),
    ).rejects.toThrow("OGSERC/RL/001 is already in the File Index.");
  });

  it("V9: generates the next reference for the file class (C8)", async () => {
    const licensee = await list("FILE_CLASS", "Licensee file");
    const policy = await list("FILE_CLASS", "Policy & regulations");
    const r1 = await createFile(db, officer, {
      reference: "",
      title: "Third licensee",
      fileClassId: licensee,
    });
    // RL/001 exists (F1).
    expect(r1.file.reference).toBe("OGSERC/RL/002");
    expect(r1.message).toBe("OGSERC/RL/002 added to the File Index.");
    const r2 = await createFile(db, officer, {
      reference: "",
      title: "Regulations",
      fileClassId: policy,
    });
    expect(r2.file.reference).toBe("OGSERC/POL/001");
    // Typed, any case, when RL/002 exists → refused.
    await expect(
      createFile(db, officer, { reference: "ogserc/rl/002", title: "Dup" }),
    ).rejects.toThrow("OGSERC/RL/002 is already in the File Index.");
    // Two at once never share a serial.
    const [a, b] = await Promise.all([
      createFile(db, officer, {
        reference: "",
        title: "A",
        fileClassId: licensee,
      }),
      createFile(db, officer, {
        reference: "",
        title: "B",
        fileClassId: licensee,
      }),
    ]);
    expect([a.file.reference, b.file.reference].sort()).toEqual([
      "OGSERC/RL/003",
      "OGSERC/RL/004",
    ]);
  });

  it("asks for a class code, or a typed reference (C8)", async () => {
    const legal = await list("FILE_CLASS", "Legal");
    await db.listItem.update({ where: { id: legal }, data: { code: null } });
    await expect(
      createFile(db, officer, {
        reference: "",
        title: "X",
        fileClassId: legal,
      }),
    ).rejects.toThrow(
      "Set a file class code for 'Legal' in Admin, or type the file reference.",
    );
    await expect(
      createFile(db, officer, { reference: "", title: "X" }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof FormProblems && e.missing.includes("File reference"),
    );
  });

  it("lists missing fields and closed-file rules", async () => {
    await expect(
      createFile(db, officer, { reference: "OGSERC/X/1", title: "" }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof FormProblems && e.missing.includes("Title"),
    );
    await expect(
      updateFile(db, officer, ids.F1, {
        fileStatusId: await list("FILE_STATUS", "Closed"),
      }),
    ).rejects.toThrow(
      "Date closed / archived: required when the file is closed.",
    );
  });

  it("flags correspondence after the file was closed", async () => {
    await updateFile(db, officer, ids.F1, {
      fileStatusId: await list("FILE_STATUS", "Closed"),
      dateClosedOrArchived: "2026-11-28",
    });
    const d = await fileDetail(db, officer.user, ids.F1, DEC_10);
    expect(d?.derived.flags).toEqual(["Correspondence after file closed"]);
  });
});

describe("Issue and return", () => {
  it("issues with the TEMPLATES message and return due date", async () => {
    const { file } = await createFile(db, at(officer, "2026-11-19"), {
      reference: "OGSERC/LEG/001",
      title: "Legal opinions",
    });
    const r = await issueFile(db, at(officer, "2026-11-20", "14:00"), file.id, {
      issuedTo: "Legal Adviser",
      unitId: await unit("Compliance/Legal Services unit: Legal"),
    });
    expect(r.message).toBe(
      "OGSERC/LEG/001 issued to Legal Adviser. Return due 25-Nov-2026.",
    );
    expect(r.movement).toMatchObject({ issuedWhileOut: false, volume: 1 });
  });

  it("asks before issuing a file that is still out, then flags the movement", async () => {
    const asked = issueFile(db, officer, ids.F2, {
      issuedTo: "Legal Adviser",
      unitId: await unit("Compliance/Legal Services unit: Legal"),
    });
    await expect(asked).rejects.toBeInstanceOf(StillOut);
    await expect(asked).rejects.toThrow(
      "OGSERC/GOV/001 is still out with PA to Chairman (Office of the General Counsel and Secretary (Registry)). Issue it anyway?",
    );
    expect(await db.fileMovement.count({ where: { fileId: ids.F2 } })).toBe(1);

    await issueFile(
      db,
      officer,
      ids.F2,
      {
        issuedTo: "Legal Adviser",
        unitId: await unit("Compliance/Legal Services unit: Legal"),
      },
      { confirmStillOut: true },
    );
    const d = await fileDetail(db, officer.user, ids.F2, DEC_10);
    expect(d?.derived.currentlyWith).toBe(
      "Legal Adviser (Compliance/Legal Services unit: Legal)",
    );
    expect(d?.movements[0].derived.flags).toEqual([
      "Earlier movement of this file not returned",
    ]);
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: ids.F2, action: "issue" },
    });
    expect(log.note).toContain("still out with PA to Chairman");
  });

  it("returns the latest unreturned movement first, then says nothing is out", async () => {
    await issueFile(
      db,
      officer,
      ids.F2,
      {
        issuedTo: "Legal Adviser",
        unitId: await unit("Compliance/Legal Services unit: Legal"),
      },
      { confirmStillOut: true },
    );
    expect((await recordReturn(db, officer, ids.F2)).message).toBe(
      "OGSERC/GOV/001 returned to the Registry from Legal Adviser (Compliance/Legal Services unit: Legal).",
    );
    expect((await recordReturn(db, officer, ids.F2)).message).toBe(
      "OGSERC/GOV/001 returned to the Registry from PA to Chairman (Office of the General Counsel and Secretary (Registry)).",
    );
    await expect(recordReturn(db, officer, ids.F2)).rejects.toThrow(
      "OGSERC/GOV/001 is not recorded as out. Nothing to return.",
    );
    const d = await fileDetail(db, officer.user, ids.F2, DEC_10);
    expect(d?.derived).toMatchObject({ currentlyWith: "Registry", flags: [] });
  });

  it("refuses a return before the file went out (R10)", async () => {
    await expect(
      recordReturn(db, officer, ids.F2, { dateReturned: "2026-12-01" }),
    ).rejects.toThrow(
      "Date returned can't be before the date the file went out.",
    );
  });

  it("V10: needs an OGSERC unit from the list (Internal File Desk, C8)", async () => {
    const { file } = await createFile(db, officer, {
      reference: "OGSERC/FIN/002",
      title: "Budget",
    });
    await expect(
      issueFile(db, officer, file.id, { issuedTo: "Accountant" }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof FormProblems && e.missing.includes("Unit"),
    );
    // Not one of the units (here: a list item's id).
    await expect(
      issueFile(db, officer, file.id, {
        issuedTo: "Accountant",
        unitId: await list("FILE_STATUS", "Closed"),
      }),
    ).rejects.toThrow("Unit: choose a value from the list.");
  });

  it("needs someone to issue to", async () => {
    const { file } = await createFile(db, officer, {
      reference: "OGSERC/FIN/001",
      title: "Budget",
    });
    await expect(
      issueFile(db, officer, file.id, { issuedTo: " " }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof FormProblems && e.missing.includes("Issued to"),
    );
  });
});

describe("permissions", () => {
  it("keeps read-only roles and unit officers off the File Desk", async () => {
    const secretary = await actorFor(db, ids.users.secretary);
    await expect(
      issueFile(db, secretary, ids.F1, { issuedTo: "Someone" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const u = await db.user.create({
      data: {
        name: "Unit",
        email: "unit.f@example.invalid",
        role: "UNIT_OFFICER",
        unitId: await unit("Compliance/Legal Services unit: Legal"),
      },
    });
    const unitOfficer = await actorFor(db, u.id);
    await expect(
      fileIndex(db, unitOfficer.user, {}, DEC_10),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createFile(db, unitOfficer, { reference: "X", title: "Y" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides a confidential file from officers even by id", async () => {
    await db.registryFile.update({
      where: { id: ids.F1 },
      data: { securityId: await list("FILE_SECURITY", "Confidential") },
    });
    expect(await fileDetail(db, officer.user, ids.F1, DEC_10)).toBeNull();
    await expect(recordReturn(db, officer, ids.F1)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
