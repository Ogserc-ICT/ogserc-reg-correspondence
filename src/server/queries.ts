// Scoped reads. An item outside the user's scope is "not found", so its
// existence isn't revealed. Phase 4 adds filters, search and paging.
import type { Principal } from "@/domain/permissions";
import { fileWhere, inwardWhere, outwardWhere } from "./access";
import type { Db } from "./db";

export async function listInward(db: Db, user: Principal, take = 200) {
  return db.inwardItem.findMany({
    where: inwardWhere(user),
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
    take,
  });
}

export async function getInward(db: Db, user: Principal, id: string) {
  return db.inwardItem.findFirst({
    where: { AND: [{ id }, inwardWhere(user)] },
  });
}

export async function listOutward(db: Db, user: Principal, take = 200) {
  return db.outwardItem.findMany({
    where: outwardWhere(user),
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
    take,
  });
}

export async function getOutward(db: Db, user: Principal, id: string) {
  return db.outwardItem.findFirst({
    where: { AND: [{ id }, outwardWhere(user)] },
  });
}

export async function listFiles(db: Db, user: Principal) {
  return db.registryFile.findMany({
    where: fileWhere(user),
    orderBy: { reference: "asc" },
  });
}

export async function getFile(db: Db, user: Principal, id: string) {
  return db.registryFile.findFirst({
    where: { AND: [{ id }, fileWhere(user)] },
  });
}
