// Runs once when the server starts. The checks live in a Node-only module
// (they use the database and process.exit), loaded only on the Node runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startupChecks } = await import("./instrumentation-node");
    await startupChecks();
  }
}
