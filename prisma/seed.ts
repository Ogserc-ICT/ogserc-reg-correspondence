// `npm run db:seed`            reference data from seed-data.json (safe to re-run)
// `npm run db:seed -- --example` also the SPEC §12.2 example and one dev
//                               login per role (dev/test only)
// `npm run db:seed -- --logins --files`  dev logins and the two example files
//                               only (empty registers; Phase 4 e2e test)
import "dotenv/config";
import { appNow } from "../src/server/clock";
import { createDb } from "../src/server/db";
import {
  DEV_PASSWORD,
  seedDevLogins,
  seedExample,
  seedExampleFiles,
} from "./seed/example";
import { seedReference } from "./seed/reference";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  try {
    const added = await seedReference(db, appNow(), (line) =>
      console.warn(`Seed: ${line}`),
    );
    console.log("Reference data added:", added);
    const arg = (a: string) => process.argv.includes(a);
    if (arg("--example")) {
      const ids = await seedExample(db);
      console.log(
        ids
          ? "Example scenario added."
          : "Items already exist; example skipped.",
      );
    }
    if (arg("--example") || arg("--logins")) {
      const emails = await seedDevLogins(db);
      const shown = process.env.DEV_SEED_PASSWORD
        ? "from DEV_SEED_PASSWORD"
        : DEV_PASSWORD;
      console.log(`Dev logins (password: ${shown}):`);
      for (const email of emails) console.log(`  ${email}`);
    }
    if (arg("--files")) {
      await seedExampleFiles(db);
      console.log("Example files OGSERC/RL/001 and OGSERC/GOV/001 added.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
