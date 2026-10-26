/**
 * Local PostgreSQL without Docker (STACK: embedded-postgres).
 *
 *   npm run db          dev cluster   on port 5443, database ogserc_registry
 *   npm run db:test     test cluster  on port 5444, database ogserc_registry_test
 *   npm run db:e2e      e2e cluster   on port 5445, database ogserc_registry_e2e
 *
 * Data lives in .pgdata/<target> (git-ignored). Runs in the foreground; Ctrl+C stops it.
 */
import {
  localUrl,
  startCluster,
  stopCluster,
  targets,
  type Target,
} from "./pg-cluster";

async function main() {
  const name = (process.argv[2] ?? "dev") as Target;
  if (!targets[name]) {
    console.error(
      `Unknown target "${name}". Use one of: ${Object.keys(targets).join(", ")}`,
    );
    process.exit(1);
  }

  const pg = await startCluster(name);
  console.log(`PostgreSQL (${name}) ready: ${localUrl(name)}`);

  const stop = async () => {
    await stopCluster(name, pg);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
