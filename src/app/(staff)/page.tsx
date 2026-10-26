// Placeholder until the Registry Desk (tiles + buttons) arrives in Phase 4.
import { Suspense } from "react";
import { ROLE_LABELS } from "@/domain/permissions";
import { requireUser } from "@/server/current-user";

export default function Home() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Registry Desk</h1>
      <Suspense fallback={<p className="mt-2 text-neutral-500">Loading…</p>}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const user = await requireUser();
  return (
    <p className="mt-2 text-neutral-700">
      Signed in as {user.name} ({ROLE_LABELS[user.role]}). The registers open
      here in Phase 4.
    </p>
  );
}
