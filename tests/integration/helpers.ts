// Shared set-up for integration tests: one client per file, a clean database
// with reference data before each test.
import { afterAll, inject } from "vitest";
import { seedReference } from "../../prisma/seed/reference";
import { instantIn } from "@/domain/clock";
import { createDb, type Db } from "@/server/db";
import type { Actor } from "@/server/registers";
import { loadPrincipal } from "@/server/session";

export function connectTestDb(): Db {
  const db = createDb(inject("databaseUrl"));
  afterAll(() => db.$disconnect());
  return db;
}

/** Empties every table (TRUNCATE skips the delete triggers) and reseeds reference data. */
export async function resetDb(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  await seedReference(db, instantIn("2026-11-01", "08:00"));
}

/** "Today" for the §12.2 scenario: 10 Dec 2026, 09:00 Lagos. */
export const DEC_10 = instantIn("2026-12-10", "09:00");

export async function actorFor(
  db: Db,
  userId: string,
  now = DEC_10,
): Promise<Actor> {
  return { user: await loadPrincipal(db, userId), now };
}
