// The workbook example scenario (SPEC §12.2), for dev and test databases only.
// Items go through the same create functions as the app, so numbers come from
// the counters: I1–I3 → ACK 00001–00003, O1–O2 → OUT 00001–00002.
import { instantIn } from "../../src/domain/clock";
import type { ListKind } from "../../src/generated/prisma/client";
import { audit } from "../../src/server/audit";
import { hashPassword } from "../../src/server/auth";
import type { Db, Tx } from "../../src/server/db";
import { toDbDate } from "../../src/server/dates";
import { createInward, createOutward } from "../../src/server/registers";

export function assertNotProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === "production")
    throw new Error("The example scenario is for dev and test databases only.");
}

/** Placeholder staff. They have no password, so nobody can sign in as them. */
const PEOPLE = [
  {
    key: "officer",
    name: "Registry Officer 1",
    email: "registry.officer1@example.invalid",
    role: "REGISTRY_OFFICER",
  },
  {
    key: "head",
    name: "Head of Registry",
    email: "head.registry@example.invalid",
    role: "HEAD_OF_REGISTRY",
  },
  {
    key: "secretary",
    name: "Secretary to the Commission",
    email: "secretary@example.invalid",
    role: "SECRETARY",
    isSignatory: true,
    designation: "Secretary to the Commission",
  },
  {
    key: "chairman",
    name: "Chairman",
    email: "chairman@example.invalid",
    role: "SECRETARY",
    isSignatory: true,
    designation: "Chairman",
  },
] as const;

export type ExampleIds = Record<
  "I1" | "I2" | "I3" | "O1" | "O2" | "F1" | "F2",
  string
> & {
  users: Record<(typeof PEOPLE)[number]["key"], string>;
};

async function lookups(tx: Tx) {
  const lists = await tx.listItem.findMany();
  const units = await tx.unit.findMany();
  const inTypes = await tx.incomingType.findMany();
  const outTypes = await tx.outgoingType.findMany();
  const find = <T>(xs: T[], p: (x: T) => boolean, what: string) => {
    const x = xs.find(p);
    if (!x) throw new Error(`Seed reference data first: missing ${what}`);
    return x;
  };
  return {
    list: (list: ListKind, label: string) =>
      find(
        lists,
        (l) => l.list === list && l.label === label,
        `${list} ${label}`,
      ).id,
    unit: (name: string) =>
      find(units, (u) => u.name === name, `unit ${name}`).id,
    inType: (name: string) =>
      find(inTypes, (t) => t.name === name, `type ${name}`).id,
    outType: (name: string) =>
      find(outTypes, (t) => t.name === name, `type ${name}`).id,
  };
}

/** Returns null if the database already has items (nothing is changed). */
/** F1 and F2 (SPEC §12.2), created if missing. */
async function createExampleFiles(tx: Tx, officerId: string) {
  const L = await lookups(tx);
  const file = async (
    reference: string,
    title: string,
    fileClass: string,
    security: string,
    unit: string,
  ) => {
    const existing = await tx.registryFile.findUnique({ where: { reference } });
    if (existing) return existing.id;
    const f = await tx.registryFile.create({
      data: {
        reference,
        title,
        fileClassId: L.list("FILE_CLASS", fileClass),
        owningUnitId: L.unit(unit),
        dateOpened: toDbDate("2026-11-02"),
        securityId: L.list("FILE_SECURITY", security),
        fileStatusId: L.list("FILE_STATUS", "Open"),
        createdById: officerId,
      },
    });
    await audit(
      tx,
      {
        userId: officerId,
        action: "create",
        entityType: "RegistryFile",
        entityId: f.id,
        after: f,
      },
      instantIn("2026-11-02", "09:00"),
    );
    return f.id;
  };
  return {
    F1: await file(
      "OGSERC/RL/001",
      "Sample Mini-Grid Ltd",
      "Licensee file",
      "Restricted",
      "Licensing unit",
    ),
    F2: await file(
      "OGSERC/GOV/001",
      "NERC and Federal agencies",
      "Government & external relations",
      "Open",
      "Office of the General Counsel and Secretary (Registry)",
    ),
  };
}

/**
 * Only the example files, for entering the §12.2 items by hand (e2e test of
 * Phase 4). Run seedDevLogins first so the registry officer exists.
 */
export async function seedExampleFiles(db: Db) {
  assertNotProduction();
  const officer = await db.user.findUniqueOrThrow({
    where: { email: "registry.officer1@example.invalid" },
  });
  return db.$transaction((tx) => createExampleFiles(tx, officer.id));
}

export async function seedExample(db: Db): Promise<ExampleIds | null> {
  assertNotProduction();
  if ((await db.inwardItem.count()) + (await db.outwardItem.count()) > 0)
    return null;

  return db.$transaction(
    async (tx) => {
      const L = await lookups(tx);
      const users = {} as ExampleIds["users"];
      for (const p of PEOPLE) {
        const { key, ...data } = p;
        const u = await tx.user.upsert({
          where: { email: p.email },
          update: {},
          create: data,
        });
        users[key] = u.id;
      }
      const officer = {
        id: users.officer,
        role: "REGISTRY_OFFICER" as const,
        unitId: null,
        active: true,
      };
      const at = (date: string, time = "09:00") => ({
        user: officer,
        now: instantIn(date, time),
      });

      const { F1, F2 } = await createExampleFiles(tx, users.officer);

      const I1 = await createInward(
        tx,
        {
          receivedAt: instantIn("2026-11-20", "10:15"),
          modeId: L.list("RECEIPT_MODE", "Hand delivery"),
          typeId: L.inType("REG-01 Registration (new)"),
          sender: "Sample Mini-Grid Ltd",
          senderCategoryId: L.list("PARTY_CATEGORY", "Registrant / licensee"),
          subject: "Registration of mini-grid operator",
          receivedById: users.officer,
          ackIssuedViaId: L.list("ACK_VIA", "Printed slip"),
          actionRequiredId: L.list("ACTION_REQUIRED", "Action required"),
          cacNo: "RC0000000",
          principalLgaId: L.list("LGA", "Sagamu"),
          volumes: 2,
          schedule2DocsAttached: 12,
          feeEvidenceAttached: true,
          paymentRef: "OGSERC-PAY-0001",
          amountShownKobo: BigInt(25_000_000),
          fileId: F1,
          actionOfficer: "Head, Registration",
          dateForwarded: "2026-11-20",
          receivedByUnitOfficer: "Reg. Officer",
        },
        at("2026-11-20", "10:15"),
      );

      const O1 = await createOutward(
        tx,
        {
          documentDate: "2026-11-25",
          typeId: L.outType("Deficiency notice"),
          subject: "Deficiency notice: registration of mini-grid operator",
          addressee: "Sample Mini-Grid Ltd",
          recipientCategoryId: L.list(
            "PARTY_CATEGORY",
            "Registrant / licensee",
          ),
          inReplyToInwardId: I1.id,
          fileId: F1,
          originatingUnitId: L.unit("Licensing unit"),
          signedById: users.secretary,
          signatoryDesignation: "Secretary to the Commission",
          dispatchModeId: L.list("RECEIPT_MODE", "Email"),
          dateDispatched: "2026-11-25",
          deliveryConfirmed: true,
          dateDelivered: "2026-11-25",
        },
        at("2026-11-25"),
      );

      const I2 = await createInward(
        tx,
        {
          receivedAt: instantIn("2026-11-30", "18:40"),
          modeId: L.list("RECEIPT_MODE", "Email"),
          typeId: L.inType("Deficiency response"),
          sender: "Sample Mini-Grid Ltd",
          senderCategoryId: L.list("PARTY_CATEGORY", "Registrant / licensee"),
          subject: "Response to deficiency notice",
          receivedById: users.officer,
          ackIssuedViaId: L.list("ACK_VIA", "Email"),
          actionRequiredId: L.list("ACTION_REQUIRED", "Action required"),
          relatedOgsercNo: "ACK/2026/00001",
          inResponseToOutwardId: O1.id,
          schedule2DocsAttached: 1,
          fileId: F1,
        },
        at("2026-12-01"),
      );

      const I3 = await createInward(
        tx,
        {
          receivedAt: instantIn("2026-12-02", "11:05"),
          modeId: L.list("RECEIPT_MODE", "Hand delivery"),
          typeId: L.inType("Letter from NERC / Federal agency"),
          sender: "Nigerian Electricity Regulatory Commission",
          senderCategoryId: L.list("PARTY_CATEGORY", "NERC"),
          subject: "Transition arrangements",
          receivedById: users.officer,
          ackIssuedViaId: L.list("ACK_VIA", "Not required"),
          actionRequiredId: L.list("ACTION_REQUIRED", "Reply required"),
          priorityId: L.list("PRIORITY", "High"),
          unitOverrideId: L.unit(
            "Office of the General Counsel and Secretary (Registry)",
          ),
          fileId: F2,
          dateForwarded: "2026-12-02",
          receivedByUnitOfficer: "PA to Chairman",
        },
        at("2026-12-02", "11:05"),
      );

      const O2 = await createOutward(
        tx,
        {
          documentDate: "2026-12-02",
          typeId: L.outType("Letter to NERC / Federal agency"),
          subject: "Re: transition arrangements",
          addressee: "Nigerian Electricity Regulatory Commission",
          recipientCategoryId: L.list("PARTY_CATEGORY", "NERC"),
          inReplyToInwardId: I3.id,
          fileId: F2,
          originatingUnitId: L.unit(
            "Office of the General Counsel and Secretary (Registry)",
          ),
          signedById: users.chairman,
          signatoryDesignation: "Chairman",
          dispatchModeId: L.list("RECEIPT_MODE", "Courier"),
          dateDispatched: "2026-12-03",
        },
        at("2026-12-03"),
      );

      const move = async (
        fileId: string,
        outAt: Date,
        issuedTo: string,
        unit: string,
        dateReturned: string | null,
      ) => {
        const m = await tx.fileMovement.create({
          data: {
            fileId,
            outAt,
            releasedById: users.officer,
            issuedTo,
            unitId: L.unit(unit),
            dateReturned: toDbDate(dateReturned),
            receivedBackById: dateReturned ? users.officer : null,
          },
        });
        await audit(
          tx,
          {
            userId: users.officer,
            action: "issue",
            entityType: "FileMovement",
            entityId: m.id,
            after: m,
          },
          outAt,
        );
      };
      await move(
        F1,
        instantIn("2026-11-20", "14:00"),
        "Reg. Officer",
        "Licensing unit",
        "2026-11-25",
      );
      await move(
        F2,
        instantIn("2026-12-02", "11:30"),
        "PA to Chairman",
        "Office of the General Counsel and Secretary (Registry)",
        null,
      );

      return {
        I1: I1.id,
        I2: I2.id,
        I3: I3.id,
        O1: O1.id,
        O2: O2.id,
        F1,
        F2,
        users,
      };
    },
    { timeout: 30_000 },
  );
}

/** The password every dev login gets unless DEV_SEED_PASSWORD is set. */
export const DEV_PASSWORD = "Dev only pass 2026!";

/**
 * Sign-in accounts for local development (one per role), all with the same
 * password. Dev and test databases only; safe to re-run.
 */
export async function seedDevLogins(db: Db): Promise<string[]> {
  assertNotProduction();
  const password = process.env.DEV_SEED_PASSWORD || DEV_PASSWORD;
  const hash = await hashPassword(password);
  const unit = await db.unit.findUniqueOrThrow({
    where: { name: "Licensing unit" },
  });
  const extra = [
    {
      name: "Dev Admin",
      email: "admin@example.invalid",
      role: "ADMIN" as const,
      unitId: null,
    },
    {
      name: "Unit Officer (Licensing unit)",
      email: "unit.registration@example.invalid",
      role: "UNIT_OFFICER" as const,
      unitId: unit.id,
    },
  ];
  const emails: string[] = [];
  for (const p of [
    ...PEOPLE.map(({ key, ...rest }) => (void key, rest)),
    ...extra,
  ]) {
    const user = await db.user.upsert({
      where: { email: p.email },
      update: { mustChangePassword: false },
      create: { ...p, emailVerified: true },
    });
    await db.account.upsert({
      where: {
        providerId_accountId: { providerId: "credential", accountId: user.id },
      },
      update: { password: hash },
      create: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      },
    });
    emails.push(user.email);
  }
  return emails;
}
