// The signed-in user for pages and server actions (the Data Access Layer).
// Server actions are public endpoints, so every action calls requireUser or
// requireCan again; hiding a button is never the check.
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { can, readScope, type Capability } from "@/domain/permissions";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { sessionUser, type SessionUser } from "./session";

/**
 * Once per request. headers() comes first: it marks the render as dynamic, so
 * a build never prerenders this far or opens the database.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const h = await headers();
  return sessionUser(getDb(), getAuth(), h);
});

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

/**
 * The inward/outward registers: 403 for roles that read no items (Admin,
 * Front desk officer, SPEC-v2 C12). Queries filter by readScope as well.
 */
export async function requireRegisterReader(): Promise<SessionUser> {
  const user = await requireUser();
  if (readScope(user).kind === "none") forbidden();
  return user;
}

/** 403 page unless the user has the capability. */
export async function requireCan(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, cap)) forbidden();
  return user;
}
