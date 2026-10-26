import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/server/current-user";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Change password · OGSERC Registry",
};

export default function PasswordPage() {
  return (
    <main>
      <h1 className="mb-6 text-2xl font-semibold">Change your password</h1>
      <Suspense fallback={null}>
        <Notice />
      </Suspense>
      <PasswordForm />
    </main>
  );
}

async function Notice() {
  const user = await requireUser({ allowTemporaryPassword: true });
  if (!user.mustChangePassword) return null;
  return (
    <p className="bg-status-awaiting mb-6 max-w-xl rounded p-3 text-sm">
      You signed in with a temporary password. Choose your own before you
      continue.
    </p>
  );
}
