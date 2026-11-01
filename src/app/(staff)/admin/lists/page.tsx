// Simple lists and units (Head of Registry). Values the Registry's rules use
// can be renamed but not switched off; nothing is ever deleted.
import type { Metadata } from "next";
import { Suspense } from "react";
import { TextInput } from "@/app/_components/inputs";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { LIST_KINDS, loadReference } from "@/server/reference";
import { saveListItemAction, saveUnitAction } from "../reference-actions";
import { AddForm, Check, Editor, Tabs } from "../reference-ui";

export const metadata: Metadata = { title: "Lists · OGSERC Registry" };

export default function ListsPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="mb-6 text-[28px] font-semibold tracking-tight">
        Reference data
      </h1>
      <Tabs />
      <Suspense fallback={<p className="text-text-faint">Loading…</p>}>
        <Lists />
      </Suspense>
    </main>
  );
}

async function Lists() {
  const user = await requireCan("reference.manage");
  const ref = await loadReference(getDb(), { user, now: appNow() });

  return (
    <div className="space-y-10">
      <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
        <h2 className="mb-2 text-lg font-semibold">Units</h2>
        <div className="mt-3 space-y-2">
          {ref.units.map((u) => (
            <Editor
              key={u.id}
              action={saveUnitAction.bind(null, u.id)}
              summary={
                <span
                  className={u.active ? "" : "text-text-faint line-through"}
                >
                  {u.name}
                </span>
              }
            >
              <TextInput
                name="name"
                label="Name"
                required
                defaultValue={u.name}
              />
              <TextInput
                name="sortOrder"
                type="number"
                label="Order"
                defaultValue={String(u.sortOrder)}
              />
              <div className="pt-6">
                <Check name="active" label="In use" defaultChecked={u.active} />
              </div>
            </Editor>
          ))}
        </div>
        <AddForm action={saveUnitAction.bind(null, null)} submit="Add unit">
          <TextInput name="name" label="Name" required />
          <TextInput
            name="sortOrder"
            type="number"
            label="Order"
            defaultValue="99"
          />
          <div className="pt-6">
            <Check name="active" label="In use" defaultChecked />
          </div>
        </AddForm>
      </section>

      {LIST_KINDS.map(({ kind, title }) => {
        const items = ref.listItems.filter((i) => i.list === kind);
        const modes = kind === "RECEIPT_MODE";
        return (
          <section
            key={kind}
            className="rounded-panel border-border-subtle bg-surface border p-[22px]"
          >
            <h2 className="mb-2 text-lg font-semibold">{title}</h2>
            {modes && (
              <p className="text-text-muted text-sm">
                &ldquo;After-hours cut-off&rdquo; marks the modes deemed
                received the next working day at or after the closing time (para
                10(3), Q3).
              </p>
            )}
            <div className="mt-3 space-y-2">
              {items.map((i) => (
                <Editor
                  key={i.id}
                  action={saveListItemAction.bind(null, kind, i.id)}
                  summary={
                    <span
                      className={i.active ? "" : "text-text-faint line-through"}
                    >
                      {i.label}
                      {i.systemKey && (
                        <span className="text-text-faint ml-2 text-xs">
                          used by the rules
                        </span>
                      )}
                      {i.afterHoursCutoff && (
                        <span className="ml-2 text-xs">
                          · after-hours cut-off
                        </span>
                      )}
                      {i.noDeliveryConfirmation && (
                        <span className="ml-2 text-xs">
                          · no delivery check
                        </span>
                      )}
                    </span>
                  }
                >
                  <TextInput
                    name="label"
                    label="Value"
                    required
                    defaultValue={i.label}
                  />
                  <TextInput
                    name="sortOrder"
                    type="number"
                    label="Order"
                    defaultValue={String(i.sortOrder)}
                  />
                  <div className="space-y-1 pt-5">
                    <Check
                      name="active"
                      label="Offered in forms"
                      defaultChecked={i.active}
                    />
                    {modes && (
                      <>
                        <Check
                          name="afterHoursCutoff"
                          label="After-hours cut-off"
                          defaultChecked={i.afterHoursCutoff}
                        />
                        <Check
                          name="noDeliveryConfirmation"
                          label="No proof of delivery needed"
                          defaultChecked={i.noDeliveryConfirmation}
                        />
                      </>
                    )}
                  </div>
                </Editor>
              ))}
            </div>
            <AddForm
              action={saveListItemAction.bind(null, kind, null)}
              submit="Add value"
            >
              <TextInput name="label" label="Value" required />
              <TextInput
                name="sortOrder"
                type="number"
                label="Order"
                defaultValue="99"
              />
              <div className="space-y-1 pt-5">
                <Check name="active" label="Offered in forms" defaultChecked />
                {modes && (
                  <>
                    <Check
                      name="afterHoursCutoff"
                      label="After-hours cut-off"
                    />
                    <Check
                      name="noDeliveryConfirmation"
                      label="No proof of delivery needed"
                    />
                  </>
                )}
              </div>
            </AddForm>
          </section>
        );
      })}
    </div>
  );
}
