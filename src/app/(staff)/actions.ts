"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { logout } from "@/server/session";

export async function logoutAction(): Promise<void> {
  await logout(getAuth(), await headers());
  redirect("/login");
}
