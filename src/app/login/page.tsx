import type { Metadata } from "next";
import Image from "next/image";
import logo from "../../../assets/ogserc-logo.png";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · OGSERC Registry" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="leading-tight">
          {/* The logo's alt text keeps the heading's name "OGSERC Registry". */}
          <h1 className="flex items-center gap-3 text-xl font-semibold">
            <Image src={logo} alt="OGSERC" className="h-10 w-auto" priority />
            Registry
          </h1>
          <p className="text-text-muted mt-2 text-sm">
            Correspondence &amp; files
          </p>
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
