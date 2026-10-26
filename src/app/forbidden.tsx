import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">You can&apos;t open this page</h1>
      <p className="mt-2 text-neutral-700">
        Your role doesn&apos;t include it. If you need access, ask the system
        administrator.
      </p>
      <Link href="/" className="text-brand-green mt-6 inline-block underline">
        Back to the Registry Desk
      </Link>
    </main>
  );
}
