/**
 * A fresh, migrated local database for automated tests (Vitest integration
 * tests and Playwright). If nothing answers at `url`, the local cluster for
 * `target` is started in its own process; the returned stop() shuts it down
 * again. The database is dropped and recreated, so only a local database
 * whose name ends in _test or _e2e is accepted.
 */
import { execSync, spawn } from "node:child_process";
import { Client } from "pg";
import { pgCtlStop, type Target } from "./pg-cluster";

function assertDisposable(url: URL) {
  const name = url.pathname.slice(1);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/_(test|e2e)$/.test(name)
  )
    throw new Error(
      `Refusing to reset ${url.hostname}/${name}: only a local *_test or *_e2e database.`,
    );
}

function adminUrl(url: URL): string {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  return admin.toString();
}

async function reachable(url: URL): Promise<boolean> {
  const c = new Client({
    connectionString: adminUrl(url),
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => {});
  }
}

/** Runs `scripts/db.ts <target>` detached, so the caller holds none of its handles. */
async function startDetached(target: Target, url: URL): Promise<void> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/db.ts", target],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
  for (const deadline = Date.now() + 90_000; Date.now() < deadline;) {
    if (await reachable(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The local ${target} database did not start within 90 s`);
}

export async function freshDatabase(
  target: Target,
  connectionString: string,
): Promise<{ stop: () => Promise<void> }> {
  const url = new URL(connectionString);
  assertDisposable(url);

  const started = !(await reachable(url));
  if (started) await startDetached(target, url);

  const c = new Client({ connectionString: adminUrl(url) });
  await c.connect();
  const name = url.pathname.slice(1);
  await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${name}"`);
  await c.end();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });

  return {
    stop: async () => {
      if (started) await pgCtlStop(target);
    },
  };
}
