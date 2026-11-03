// Incoming and outgoing types (Head of Registry). Items keep the rules they
// were saved with; changes apply to items logged from now on.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Select, TextInput } from "@/app/_components/inputs";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { loadReference, typeUnitProblems } from "@/server/reference";
import {
  saveIncomingTypeAction,
  saveOutgoingTypeAction,
} from "../reference-actions";
import { AddForm, Check, Editor, Tabs } from "../reference-ui";

export const metadata: Metadata = { title: "Types · OGSERC Registry" };

const FOOTERS = [
  {
    id: "REGISTRATION",
    label: "Registration filing (30-day decision sentence)",
  },
  { id: "PARA103", label: "Other para 10(3) filing" },
  { id: "GENERAL", label: "General correspondence" },
];

export default function TypesPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="mb-6 text-[28px] font-semibold tracking-tight">
        Reference data
      </h1>
      <Tabs />
      <Suspense fallback={<p className="text-text-faint">Loading…</p>}>
        <Types />
      </Suspense>
    </main>
  );
}

type Unit = { id: string; label: string };

function IncomingFields({
  units,
  t,
}: {
  units: Unit[];
  t?: {
    name: string;
    category: string;
    defaultUnitId: string;
    orderRef: string | null;
    responseTargetDays: number;
    slipFooter: string;
    para103SlipWording: boolean;
    isRegistration: boolean;
    requiresRelatedOgsercNo: boolean;
    active: boolean;
    sortOrder: number;
  };
}) {
  return (
    <>
      <TextInput name="name" label="Name" required defaultValue={t?.name} />
      <TextInput
        name="category"
        label="Category"
        required
        defaultValue={t?.category}
      />
      <Select
        name="defaultUnitId"
        label="Default unit"
        required
        options={units}
        defaultValue={t?.defaultUnitId}
      />
      <TextInput
        name="orderRef"
        label="Order reference"
        defaultValue={t?.orderRef ?? ""}
      />
      <TextInput
        name="responseTargetDays"
        type="number"
        label="Response target"
        hint="Working days from deemed receipt; 0 = no target (Q6)."
        required
        defaultValue={t ? String(t.responseTargetDays) : "10"}
      />
      <Select
        name="slipFooter"
        label="Slip footer (Q4)"
        required
        options={FOOTERS}
        defaultValue={t?.slipFooter ?? "GENERAL"}
      />
      <TextInput
        name="sortOrder"
        type="number"
        label="Order in lists"
        defaultValue={String(t?.sortOrder ?? 99)}
      />
      <div className="space-y-1 pt-5">
        <Check
          name="para103SlipWording"
          label="Para 10(3) heading on the slip"
          defaultChecked={t?.para103SlipWording}
        />
        <Check
          name="isRegistration"
          label="REG-01 checks (CAC, fee, Schedule 2, deadline)"
          defaultChecked={t?.isRegistration}
        />
        <Check
          name="requiresRelatedOgsercNo"
          label="Needs the related OGSERC number"
          defaultChecked={t?.requiresRelatedOgsercNo}
        />
        <Check
          name="active"
          label="Offered on New Inward"
          defaultChecked={t ? t.active : true}
        />
      </div>
    </>
  );
}

function OutgoingFields({
  t,
}: {
  t?: {
    name: string;
    responseExpected: boolean;
    responseWindowDays: number;
    closesInwardItem: boolean;
    active: boolean;
    sortOrder: number;
  };
}) {
  return (
    <>
      <TextInput name="name" label="Name" required defaultValue={t?.name} />
      <TextInput
        name="responseWindowDays"
        type="number"
        label="Response window"
        hint="Working days from dispatch; 0 = the default target."
        defaultValue={String(t?.responseWindowDays ?? 0)}
      />
      <TextInput
        name="sortOrder"
        type="number"
        label="Order in lists"
        defaultValue={String(t?.sortOrder ?? 99)}
      />
      <div className="space-y-1 pt-5">
        <Check
          name="responseExpected"
          label="A response is expected"
          defaultChecked={t?.responseExpected}
        />
        <Check
          name="closesInwardItem"
          label="Closes the inward item it replies to"
          defaultChecked={t ? t.closesInwardItem : true}
        />
        <Check
          name="active"
          label="Offered on New Outward"
          defaultChecked={t ? t.active : true}
        />
      </div>
    </>
  );
}

async function Types() {
  const user = await requireCan("reference.manage");
  const ref = await loadReference(getDb(), { user, now: appNow() });
  const units = ref.units.map((u) => ({ id: u.id, label: u.name }));
  const problems = await typeUnitProblems(getDb());

  return (
    <div className="space-y-10">
      {problems.length > 0 && (
        <div role="note" className="bg-status-overdue rounded p-3 text-sm">
          <p className="font-semibold">Check these default units</p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
        <h2 className="mb-2 text-lg font-semibold">Incoming types</h2>
        <p className="text-text-muted mb-3 text-sm">
          Items already logged keep the rules they were saved with; changes
          apply to items logged from now on.
        </p>
        <div className="space-y-2">
          {ref.incomingTypes.map((t) => (
            <Editor
              key={t.id}
              action={saveIncomingTypeAction.bind(null, t.id)}
              summary={
                <span
                  className={t.active ? "" : "text-text-faint line-through"}
                >
                  <strong>{t.name}</strong> · {t.category} ·{" "}
                  {t.defaultUnit.name} ·{" "}
                  {t.responseTargetDays
                    ? `${t.responseTargetDays} working days`
                    : "no target"}
                </span>
              }
            >
              <IncomingFields units={units} t={t} />
            </Editor>
          ))}
        </div>
        <AddForm
          action={saveIncomingTypeAction.bind(null, null)}
          submit="Add incoming type"
        >
          <IncomingFields units={units} />
        </AddForm>
      </section>

      <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
        <h2 className="mb-2 text-lg font-semibold">Outgoing document types</h2>
        <p className="text-text-muted mb-3 text-sm">
          Untick &ldquo;Closes the inward item&rdquo; for holding replies (SPEC
          §9 R4).
        </p>
        <div className="space-y-2">
          {ref.outgoingTypes.map((t) => (
            <Editor
              key={t.id}
              action={saveOutgoingTypeAction.bind(null, t.id)}
              summary={
                <span
                  className={t.active ? "" : "text-text-faint line-through"}
                >
                  <strong>{t.name}</strong>
                  {t.responseExpected
                    ? ` · response expected (${t.responseWindowDays || "default"} days)`
                    : ""}
                  {t.closesInwardItem
                    ? ""
                    : " · does not close the inward item"}
                </span>
              }
            >
              <OutgoingFields t={t} />
            </Editor>
          ))}
        </div>
        <AddForm
          action={saveOutgoingTypeAction.bind(null, null)}
          submit="Add document type"
        >
          <OutgoingFields />
        </AddForm>
      </section>
    </div>
  );
}
