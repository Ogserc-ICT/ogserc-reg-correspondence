// `npm run db:seed`            reference data from seed-data.json (safe to re-run)
// `npm run db:seed -- --example` also the SPEC §12.2 example and one dev
//                               login per role (dev/test only)
import "dotenv/config";
import { appNow } from "../src/server/clock";
import { createDb } from "../src/server/db";
import { DEV_PASSWORD, seedDevLogins, seedExample } from "./seed/example";
import { seedReference } from "./seed/reference";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  try {
    const added = await seedReference(db, appNow());
    console.log("Reference data added:", added);
    if (process.argv.includes("--example")) {
      const ids = await seedExample(db);
      console.log(
        ids
          ? "Example scenario added."
          : "Items already exist; example skipped.",
      );
      const emails = await seedDevLogins(db);
      const shown = process.env.DEV_SEED_PASSWORD
        ? "from DEV_SEED_PASSWORD"
        : DEV_PASSWORD;
      console.log(`Dev logins (password: ${shown}):`);
      for (const email of emails) console.log(`  ${email}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
