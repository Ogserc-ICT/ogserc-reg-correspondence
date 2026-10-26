// Choices for the forms, from the database (never hard-coded; CLAUDE.md).
// Only active values are offered.
import type { ListKind } from "@/generated/prisma/client";
import type { Db } from "../db";

export type Option = { id: string; label: string; key?: string | null };

export async function formOptions(db: Db) {
  const items = await db.listItem.findMany({
    where: { active: true },
    orderBy: [{ list: "asc" }, { sortOrder: "asc" }],
  });
  const list = (kind: ListKind): Option[] =>
    items
      .filter((i) => i.list === kind)
      .map((i) => ({ id: i.id, label: i.label, key: i.systemKey }));

  const units = await db.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const incomingTypes = await db.incomingType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { defaultUnit: { select: { name: true } } },
  });
  const outgoingTypes = await db.outgoingType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const registryUsers = await db.user.findMany({
    where: {
      active: true,
      role: { in: ["REGISTRY_OFFICER", "HEAD_OF_REGISTRY"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const signatories = await db.user.findMany({
    where: { active: true, isSignatory: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, designation: true },
  });

  const staff = await db.user.findMany({
    where: { active: true, role: { not: "ADMIN" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return {
    fileClasses: list("FILE_CLASS"),
    fileSecurity: list("FILE_SECURITY"),
    fileStatuses: list("FILE_STATUS"),
    staff: staff.map((u) => ({ id: u.id, label: u.name })),
    receiptModes: list("RECEIPT_MODE"),
    lgas: list("LGA"),
    ackVia: list("ACK_VIA"),
    partyCategories: list("PARTY_CATEGORY"),
    actionRequired: list("ACTION_REQUIRED"),
    priorities: list("PRIORITY"),
    units: units.map((u) => ({ id: u.id, label: u.name })),
    incomingTypes: incomingTypes.map((t) => ({
      id: t.id,
      label: t.name,
      category: t.category,
      defaultUnit: t.defaultUnit.name,
      isRegistration: t.isRegistration,
    })),
    outgoingTypes: outgoingTypes.map((t) => ({
      id: t.id,
      label: t.name,
      responseExpected: t.responseExpected,
    })),
    registryUsers: registryUsers.map((u) => ({ id: u.id, label: u.name })),
    signatories: signatories.map((u) => ({
      id: u.id,
      label: u.designation ? `${u.name} (${u.designation})` : u.name,
      designation: u.designation ?? "",
    })),
  };
}

export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
