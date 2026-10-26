// The signed-in user for pages and server actions (the Data Access Layer).
// Server actions are public endpoints, so every action calls requireUser or
// requireCan again; hiding a button is never the check.
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { can, type Capability } from "@/domain/permissions";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { sessionUser, type SessionUser } from "./session";

/** Once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> =>
  sessionUser(getDb(), getAuth(), await headers()),
);

/**
 * Redirects to /login without a session, and to /account/password while a
 * temporary password is still in use.
 */
export async function requireUser(
  opts: { allowTemporaryPassword?: boolean } = {},
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowTemporaryPassword)
    redirect("/account/password");
  return user;
}

/** 403 page unless the user has the capability. */
export async function requireCan(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, cap)) forbidden();
  return user;
}
