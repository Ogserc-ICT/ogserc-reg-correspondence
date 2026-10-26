import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · OGSERC Registry" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-brand-green text-2xl font-semibold">
        OGSERC Registry
      </h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">
        Staff sign-in. Accounts are created by the system administrator.
      </p>
      <LoginForm />
    </main>
  );
}
