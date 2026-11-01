import Link from "next/link";
import { buttonClass } from "@/app/_components/ui/button";

export default function Forbidden() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="text-[28px] font-semibold tracking-tight">
        You can&apos;t open this page
      </h1>
      <p className="text-text-muted mt-2">
        Your role doesn&apos;t include it. If you need access, ask the system
        administrator.
      </p>
      <Link href="/" className={buttonClass("secondary", "mt-6")}>
        Back to the Registry Desk
      </Link>
    </main>
  );
}
