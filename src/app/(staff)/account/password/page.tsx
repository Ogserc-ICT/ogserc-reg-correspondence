import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireUser } from "@/server/current-user";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Change password · OGSERC Registry",
};

export default function PasswordPage() {
  return (
    <main className="mx-auto w-full max-w-[560px]">
      <PageHeader
        title="Change your password"
        intro="Other sessions on your account are signed out when you change it."
      />
      <Suspense fallback={null}>
        <Notice />
      </Suspense>
      <div className="rounded-panel border-border-subtle bg-surface mt-6 border p-[22px]">
        <PasswordForm />
      </div>
    </main>
  );
}

async function Notice() {
  const user = await requireUser({ allowTemporaryPassword: true });
  if (!user.mustChangePassword) return null;
  return (
    <p className="rounded-card border-awaiting/40 bg-status-awaiting mt-6 border p-4 text-sm">
      You signed in with a temporary password. Choose your own before you
      continue.
    </p>
  );
}
