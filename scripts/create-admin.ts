/**
 * Creates the first admin account (there is no public sign-up).
 *
 *   npm run admin:create -- --email it@ogserc.gov.ng --name "Jane Doe"
 *
 * Prints a temporary password once; the admin must change it at first sign-in.
 * Refuses if an active admin already exists, unless --force is given. Later
 * accounts are created on the Users screen.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { audit } from "../src/server/audit";
import { hashPassword } from "../src/server/auth";
import { appNow } from "../src/server/clock";
import { createDb } from "../src/server/db";
import { normaliseEmail } from "../src/server/session";
import { temporaryPassword } from "../src/server/temp-password";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  if (!values.email || !values.name)
    throw new Error(
      'Usage: npm run admin:create -- --email <email> --name "<name>"',
    );
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const db = createDb(url);
  try {
    const email = normaliseEmail(values.email);
    if (
      !values.force &&
      (await db.user.count({ where: { role: "ADMIN", active: true } }))
    )
      throw new Error(
        "An active admin already exists. Use the Users screen, or pass --force.",
      );
    if (await db.user.findUnique({ where: { email } }))
      throw new Error(`${email} already has an account.`);

    const password = temporaryPassword();
    const hash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: values.name!.trim(),
          email,
          role: "ADMIN",
          emailVerified: true,
          mustChangePassword: true,
        },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hash,
        },
      });
      await audit(
        tx,
        {
          userId: null,
          action: "user-create",
          entityType: "User",
          entityId: user.id,
          after: { name: user.name, email, role: "ADMIN" },
          note: "scripts/create-admin.ts",
        },
        appNow(),
      );
    });
    console.log(`Admin ${email} created.`);
    console.log(`Temporary password (shown once): ${password}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
