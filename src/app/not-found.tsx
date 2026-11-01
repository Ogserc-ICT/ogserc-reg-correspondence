import Link from "next/link";
import { buttonClass } from "@/app/_components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="text-[28px] font-semibold tracking-tight">Nothing here</h1>
      <p className="text-text-muted mt-2">
        This page or item doesn&apos;t exist, or it isn&apos;t in your scope.
        Check the number, or search for it from the Registry Desk.
      </p>
      <Link href="/" className={buttonClass("secondary", "mt-6")}>
        Back to the Registry Desk
      </Link>
    </main>
  );
}
