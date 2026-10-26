/**
 * Local embedded PostgreSQL clusters (STACK: embedded-postgres). Used by
 * `scripts/db.ts` and by the Vitest global setup. Local use only: the
 * credentials are fixed and not secret.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export const targets = {
  dev: { port: 5443, database: "ogserc_registry" },
  test: { port: 5444, database: "ogserc_registry_test" },
  e2e: { port: 5445, database: "ogserc_registry_e2e" },
} as const;

export type Target = keyof typeof targets;

export const LOCAL_USER = "ogserc";
export const LOCAL_PASSWORD = "ogserc";

export function localUrl(name: Target): string {
  const t = targets[name];
  return `postgresql://${LOCAL_USER}:${LOCAL_PASSWORD}@localhost:${t.port}/${t.database}`;
}

function dataDir(name: Target): string {
  return path.resolve(".pgdata", name);
}

/** Starts the cluster for `name`, creating it (and its database) on first run. */
export async function startCluster(name: Target): Promise<EmbeddedPostgres> {
  const target = targets[name];
  const databaseDir = dataDir(name);
  const firstRun = !existsSync(path.join(databaseDir, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir,
    port: target.port,
    user: LOCAL_USER,
    password: LOCAL_PASSWORD,
    persistent: true,
    onLog: () => {},
  });

  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase(target.database);
  return pg;
}

/**
 * Stops the cluster with `pg_ctl stop -m fast`. embedded-postgres' own stop()
 * force-kills the server on Windows, which can orphan worker processes that
 * keep the port open; pg_ctl shuts every process down cleanly.
 */
export async function pgCtlStop(name: Target): Promise<void> {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const { pg_ctl } = (await import(
    `@embedded-postgres/${os}-${process.arch}`
  )) as {
    pg_ctl: string;
  };
  execFileSync(pg_ctl, ["stop", "-D", dataDir(name), "-m", "fast", "-w"], {
    stdio: "ignore",
  });
}

export async function stopCluster(
  name: Target,
  pg: EmbeddedPostgres,
): Promise<void> {
  try {
    await pgCtlStop(name);
  } catch {
    await pg.stop();
  }
}
