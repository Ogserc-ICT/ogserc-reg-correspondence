// Start-up checks on the Node runtime. In production a failed check stops the
// process (exit code 1), so the host reports a failed start instead of
// serving errors.
import { assertClockSafe } from "./server/clock";
import { getDb } from "./server/db";
import { typeUnitProblems } from "./server/reference";
import { productionProblems } from "./server/startup";

export async function startupChecks() {
  assertClockSafe(); // refuses to start in production with a test clock set
  await warnAboutTypeUnits();
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

/** C2/V13: a warning only; the admin fixes it on Admin › Types. */
async function warnAboutTypeUnits() {
  if (!process.env.DATABASE_URL) return;
  try {
    const problems = await typeUnitProblems(getDb());
    if (problems.length)
      console.warn(
        `OGSERC Registry: check incoming type default units (Admin › Types):\n- ${problems.join("\n- ")}`,
      );
  } catch (err) {
    console.warn("OGSERC Registry: could not check type default units.", err);
  }
}
