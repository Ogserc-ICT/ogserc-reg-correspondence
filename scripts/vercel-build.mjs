// Vercel build (package.json "vercel-build"): apply database migrations, then
// build. Migrations run only for production deployments, so a preview can
// never change the live database; set MIGRATE_ON_BUILD=1 for a preview that
// has its own database (e.g. a Neon preview branch).
import { execSync } from "node:child_process";

export function shouldMigrate(env) {
  return env.VERCEL_ENV === "production" || env.MIGRATE_ON_BUILD === "1";
}

/** Migrations need a database; the Neon integration sets these. */
export function hasDatabaseUrl(env) {
  return Boolean(env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim());
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.argv[1]?.endsWith("vercel-build.mjs")) {
  if (shouldMigrate(process.env)) {
    if (!hasDatabaseUrl(process.env)) {
      console.error(
        "No database for this deployment: DATABASE_URL is not set.\n" +
          "Add the Neon integration to the Vercel project (Storage tab) and connect it\n" +
          "to the Production environment, or set DATABASE_URL and DATABASE_URL_UNPOOLED\n" +
          "under Settings > Environment Variables. Then redeploy.",
      );
      process.exit(1);
    }
    run("npx prisma migrate deploy");
  } else console.log("Preview build: database migrations skipped.");
  run("npx next build");
}
