// Production start-up checks (CLAUDE.md Phase 8: dev seed data must never
// reach production). The server refuses to start if any check fails.
export type StartupDb = {
  /** Accounts made by the dev seed (all use @example.invalid). */
  countDevUsers(): Promise<number>;
};

export async function productionProblems(
  env: NodeJS.ProcessEnv,
  db: StartupDb,
): Promise<string[]> {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (env.APP_NOW?.trim() || env.APP_NOW_FILE?.trim())
    problems.push("APP_NOW / APP_NOW_FILE is set. Remove the test clock.");
  if ((env.BETTER_AUTH_SECRET?.trim().length ?? 0) < 32)
    problems.push(
      "BETTER_AUTH_SECRET must be set to at least 32 random characters.",
    );
  if (!env.DATABASE_URL?.trim()) problems.push("DATABASE_URL is not set.");
  if (env.DEV_SEED_PASSWORD?.trim())
    problems.push("DEV_SEED_PASSWORD is set. Remove it.");
  if (!problems.some((p) => p.startsWith("DATABASE_URL"))) {
    const dev = await db.countDevUsers();
    if (dev > 0)
      problems.push(
        `The database has ${dev} dev account(s) (@example.invalid): this looks like a dev or test database. Use a fresh database for production.`,
      );
  }
  return problems;
}
