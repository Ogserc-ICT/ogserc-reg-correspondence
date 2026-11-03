/**
 * Upgrades an existing database's reference data to v2 (docs/V2_GAP_REPORT.md §2).
 * For a database seeded before v2; a fresh database just runs the seed.
 *
 *   npx tsx scripts/upgrade-reference-v2.ts                       dry run (default)
 *   npx tsx scripts/upgrade-reference-v2.ts --commit --confirm <fingerprint>
 *
 * The dry run does everything in one transaction, prints every change with its
 * before/after values and a fingerprint, then rolls back. --commit refuses to
 * run without --confirm, and saves nothing unless the fingerprint matches the
 * changes it is about to make. Back up the database and test the restore first
 * (docs/GO_LIVE_CHECKLIST.md).
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import {
  formatReport,
  NotConfirmedError,
  upgradeReferenceV2,
} from "../prisma/seed/upgrade-v2";
import { appNow } from "../src/server/clock";
import { createDb } from "../src/server/db";

/** host/database only: never print the password. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparsable DATABASE_URL)";
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      commit: { type: "boolean", default: false },
      confirm: { type: "string" },
    },
  });
  if (values.commit && values["dry-run"])
    throw new Error("Choose either --dry-run or --commit, not both.");
  if (values.commit && !values.confirm) {
    console.error(
      "Refusing to commit without --confirm. Run the dry run, review the report, then run:\n  --commit --confirm <fingerprint printed by the dry run>",
    );
    process.exit(2);
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  try {
    const report = await upgradeReferenceV2(db, appNow(), {
      commit: values.commit,
      confirm: values.confirm,
    });
    console.log(formatReport(report, describe(url)));
  } catch (err) {
    if (err instanceof NotConfirmedError) {
      console.error(`Nothing saved. ${err.message}`);
      process.exit(2);
    }
    throw err;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
