/**
 * Local PostgreSQL without Docker (STACK: embedded-postgres).
 *
 *   npm run db          dev cluster   on port 5443, database ogserc_registry
 *   npm run db:test     test cluster  on port 5444, database ogserc_registry_test
 *   npm run db:e2e      e2e cluster   on port 5445, database ogserc_registry_e2e
 *
 * Data lives in .pgdata/<target> (git-ignored). Runs in the foreground; Ctrl+C stops it.
 * Local use only: the credentials are fixed and not secret.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const targets = {
  dev: { port: 5443, database: "ogserc_registry" },
  test: { port: 5444, database: "ogserc_registry_test" },
  e2e: { port: 5445, database: "ogserc_registry_e2e" },
} as const;

type Target = keyof typeof targets;

async function main() {
  const name = (process.argv[2] ?? "dev") as Target;
  const target = targets[name];
  if (!target) {
    console.error(
      `Unknown target "${name}". Use one of: ${Object.keys(targets).join(", ")}`,
    );
    process.exit(1);
  }

  const databaseDir = path.resolve(".pgdata", name);
  const firstRun = !existsSync(path.join(databaseDir, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir,
    port: target.port,
    user: "ogserc",
    password: "ogserc",
    persistent: true,
  });

  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase(target.database);

  console.log(
    `PostgreSQL (${name}) ready: postgresql://ogserc:ogserc@localhost:${target.port}/${target.database}`,
  );

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
