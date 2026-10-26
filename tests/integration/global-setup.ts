// Gives the integration tests a fresh, migrated database: uses DATABASE_URL_TEST
// if that server is up, otherwise starts the local test cluster (port 5444) in
// its own process and stops it afterwards. The database is dropped and
// recreated each run, so it must be a local *_test one.
import { execSync, spawn } from "node:child_process";
import "dotenv/config";
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { localUrl, pgCtlStop } from "../../scripts/pg-cluster";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function assertDisposable(url: URL) {
  const name = url.pathname.slice(1);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !name.endsWith("_test")
  )
    throw new Error(
      `Refusing to reset ${url.hostname}/${name}: integration tests only run against a local *_test database.`,
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

/** Runs `scripts/db.ts test` detached, so this process holds none of its handles. */
async function startTestCluster(url: URL): Promise<void> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/db.ts", "test"],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
  for (const deadline = Date.now() + 90_000; Date.now() < deadline;) {
    if (await reachable(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The local test database did not start within 90 s");
}

export default async function setup(project: TestProject) {
  const url = new URL(process.env.DATABASE_URL_TEST || localUrl("test"));
  assertDisposable(url);

  const started = !(await reachable(url));
  if (started) await startTestCluster(url);

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

  project.provide("databaseUrl", url.toString());

  return async () => {
    if (started) await pgCtlStop("test");
  };
}
