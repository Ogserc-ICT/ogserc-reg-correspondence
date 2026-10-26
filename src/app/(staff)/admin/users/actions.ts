"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/_components/form";
import type { Role } from "@/domain/permissions";
import { formError, formValues } from "@/server/action-errors";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import {
  createUser,
  setTemporaryPassword,
  unlockUser,
  updateUser,
  type UserInput,
} from "@/server/users";

const ROLES: Role[] = [
  "REGISTRY_OFFICER",
  "HEAD_OF_REGISTRY",
  "UNIT_OFFICER",
  "SECRETARY",
  "ADMIN",
];

function userInput(form: FormData): UserInput {
  const role = String(form.get("role") ?? "");
  return {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    // An unknown role falls back to the least privileged one.
    role: (ROLES as string[]).includes(role) ? (role as Role) : "UNIT_OFFICER",
    unitId: String(form.get("unitId") ?? "") || null,
    isSignatory: form.get("isSignatory") === "on",
    designation: String(form.get("designation") ?? "") || null,
  };
}

export async function createUserAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireCan("users.manage");
  const temporary = String(form.get("temporaryPassword") ?? "");
  try {
    const user = await createUser(
      getDb(),
      admin,
      { ...userInput(form), temporaryPassword: temporary },
      appNow(),
    );
    revalidatePath("/admin/users");
    return {
      ok: true,
      message: `Account created for ${user.email}. Give them this temporary password in person: ${temporary}. They must change it when they first sign in.`,
    };
  } catch (err) {
    return formError(err, formValues(form));
  }
}

export async function updateUserAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireCan("users.manage");
  try {
    await updateUser(
      getDb(),
      admin,
      id,
      { ...userInput(form), active: form.get("active") === "on" },
      appNow(),
    );
  } catch (err) {
    return formError(err, formValues(form));
  }
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function resetPasswordAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireCan("users.manage");
  const temporary = String(form.get("temporaryPassword") ?? "");
  try {
    await setTemporaryPassword(getDb(), admin, id, temporary, appNow());
  } catch (err) {
    return formError(err);
  }
  revalidatePath(`/admin/users/${id}`);
  return {
    ok: true,
    message: `Temporary password set: ${temporary}. Their sessions were ended and any lockout cleared.`,
  };
}

export async function unlockAction(id: string): Promise<void> {
  const admin = await requireCan("users.manage");
  await unlockUser(getDb(), admin, id, appNow());
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
}
