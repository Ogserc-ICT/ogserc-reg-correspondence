// Prisma client over node-postgres (Prisma 7 driver adapter).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

export type Db = PrismaClient;
/** A client inside `db.$transaction(async (tx) => …)`. */
export type Tx = Prisma.TransactionClient;

export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { registryDb?: Db };

/** The app's client. One per process; dev hot reload reuses it. */
export function getDb(): Db {
  if (!globalForDb.registryDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.registryDb = createDb(url);
  }
  return globalForDb.registryDb;
}
