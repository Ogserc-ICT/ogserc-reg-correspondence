import type { Metadata } from "next";
import { Icon } from "@/app/_components/ui/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · OGSERC Registry" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-control border-border bg-surface text-gold grid h-11 w-11 place-items-center border">
            <Icon name="bolt" />
          </span>
          <div className="leading-tight">
            <h1 className="text-xl font-semibold">OGSERC Registry</h1>
            <p className="text-text-muted text-sm">
              Correspondence &amp; files
            </p>
          </div>
        </div>
        <div className="rounded-panel border-border bg-surface mt-8 border p-6">
          <h2 className="text-base font-semibold">Staff sign-in</h2>
          <p className="text-text-muted mt-1 mb-6 text-sm">
            Accounts are created by the system administrator.
          </p>
          <LoginForm />
        </div>
        <p className="text-text-faint mt-6 text-center text-xs">
          Ogun State Electricity Regulatory Commission
        </p>
      </div>
    </main>
  );
}
