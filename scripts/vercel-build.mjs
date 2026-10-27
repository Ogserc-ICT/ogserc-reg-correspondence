// Vercel build (package.json "vercel-build"): apply database migrations, then
// build. Migrations run only for production deployments, so a preview can
// never change the live database; set MIGRATE_ON_BUILD=1 for a preview that
// has its own database (e.g. a Neon preview branch).
import { execSync } from "node:child_process";

export function shouldMigrate(env) {
  return env.VERCEL_ENV === "production" || env.MIGRATE_ON_BUILD === "1";
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.argv[1]?.endsWith("vercel-build.mjs")) {
  if (shouldMigrate(process.env)) run("npx prisma migrate deploy");
  else console.log("Preview build: database migrations skipped.");
  run("npx next build");
}
