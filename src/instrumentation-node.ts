// Start-up checks on the Node runtime. In production a failed check stops the
// process (exit code 1), so the host reports a failed start instead of
// serving errors.
import { assertClockSafe } from "./server/clock";
import { getDb } from "./server/db";
import { productionProblems } from "./server/startup";

export async function startupChecks() {
  assertClockSafe(); // refuses to start in production with a test clock set
  if (process.env.NODE_ENV !== "production") return;
  const problems = await productionProblems(process.env, {
    countDevUsers: () =>
      getDb().user.count({
        where: { email: { endsWith: "@example.invalid" } },
      }),
  });
  if (problems.length) {
    console.error(
      `OGSERC Registry will not start in production:\n- ${problems.join("\n- ")}`,
    );
    process.exit(1);
  }
}
