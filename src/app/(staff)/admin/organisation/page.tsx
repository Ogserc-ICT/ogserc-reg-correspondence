// Organisation (SPEC-v2 C1, C7, C8, C12): divisions and units with their
// acknowledgement email addresses, the outward signatory list and file class
// codes. Nothing is deleted: entries are switched off instead.
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Select, TextInput } from "@/app/_components/inputs";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { loadOrganisation } from "@/server/organisation";
import { AddForm, Check, Editor } from "../reference-ui";
import {
  saveDivisionAction,
  saveFileClassCodeAction,
  saveSignatoryAction,
  saveUnitAction,
} from "./actions";

export const metadata: Metadata = { title: "Organisation · OGSERC Registry" };

export default function OrganisationPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[28px] font-semibold tracking-tight">Organisation</h1>
      <p className="text-text-muted mt-1.5 mb-6">
        Divisions, units and the addresses acknowledgement emails go to; the
        signatory list; file class codes. Every change is in the audit log.
      </p>
      <Suspense fallback={<p className="text-text-faint">Loading…</p>}>
        <Organisation />
      </Suspense>
    </main>
  );
}

const Section = ({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className="rounded-panel border-border-subtle bg-surface border p-[22px]"
  >
    <h2 className="text-lg font-semibold">{title}</h2>
    {intro && <p className="text-text-muted mt-1 text-sm">{intro}</p>}
    <div className="mt-3 space-y-2">{children}</div>
  </section>
);

const off = (active: boolean) => (active ? "" : "text-text-faint line-through");
const mails = (emails: string[]) =>
  emails.length ? (
    <span className="text-text-muted ml-2 text-xs">{emails.join("; ")}</span>
  ) : (
    <span className="text-flagged ml-2 text-xs">no email address</span>
  );

async function Organisation() {
  const user = await requireCan("organisation.manage");
  const org = await loadOrganisation(getDb(), { user, now: appNow() });
  const divisionOptions = org.divisions
    .filter((d) => d.active)
    .map((d) => ({ id: d.id, label: d.name }));
  const emailHint =
    "Separate addresses with ; or ,. Acknowledgement emails go to the unit's and its division's addresses.";

  return (
    <div className="space-y-10">
      <Section
        title="Divisions"
        intro="A unit's division is used on the Dashboard and in acknowledgement emails."
      >
        {org.divisions.map((d) => (
          <Editor
            key={d.id}
            action={saveDivisionAction.bind(null, d.id)}
            summary={
              <span>
                <span className={off(d.active)}>{d.name}</span>
                {mails(d.emails)}
              </span>
            }
          >
            <TextInput
              name="name"
              label="Name"
              required
              defaultValue={d.name}
            />
            <TextInput
              name="emails"
              label="Email addresses"
              hint={emailHint}
              defaultValue={d.emails.join("; ")}
            />
            <TextInput
              name="sortOrder"
              type="number"
              label="Order"
              defaultValue={String(d.sortOrder)}
            />
            <div className="pt-6">
              <Check name="active" label="In use" defaultChecked={d.active} />
            </div>
          </Editor>
        ))}
        <AddForm
          action={saveDivisionAction.bind(null, null)}
          submit="Add division"
        >
          <TextInput name="name" label="Name" required />
          <TextInput name="emails" label="Email addresses" hint={emailHint} />
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
      </Section>

      <Section title="Units">
        {org.units.map((u) => (
          <Editor
            key={u.id}
            action={saveUnitAction.bind(null, u.id)}
            summary={
              <span>
                <span className={off(u.active)}>{u.name}</span>
                <span className="text-text-faint ml-2 text-xs">
                  {u.division?.name ?? "no division"}
                </span>
                {mails(u.emails)}
              </span>
            }
          >
            <TextInput
              name="name"
              label="Name"
              required
              defaultValue={u.name}
            />
            <Select
              name="divisionId"
              label="Division"
              required
              options={divisionOptions}
              defaultValue={u.divisionId ?? ""}
            />
            <TextInput
              name="unitGroup"
              label="Unit group"
              defaultValue={u.unitGroup ?? ""}
            />
            <TextInput
              name="emails"
              label="Email addresses"
              hint={emailHint}
              defaultValue={u.emails.join("; ")}
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
        <AddForm action={saveUnitAction.bind(null, null)} submit="Add unit">
          <TextInput name="name" label="Name" required />
          <Select
            name="divisionId"
            label="Division"
            required
            options={divisionOptions}
          />
          <TextInput name="unitGroup" label="Unit group" />
          <TextInput name="emails" label="Email addresses" hint={emailHint} />
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
      </Section>

      <Section
        title="Signatories"
        intro="Who signs outgoing letters. The default is pre-selected on New Outward."
      >
        {org.signatories.map((s) => (
          <Editor
            key={s.id}
            action={saveSignatoryAction.bind(null, s.id)}
            summary={
              <span>
                <span className={off(s.active)}>{s.name}</span>
                <span className="text-text-muted ml-2 text-xs">
                  {s.designation}
                </span>
                {s.isDefault && (
                  <span className="text-accent ml-2 text-xs font-semibold">
                    default
                  </span>
                )}
              </span>
            }
          >
            <TextInput
              name="name"
              label="Name"
              required
              defaultValue={s.name}
            />
            <TextInput
              name="designation"
              label="Designation"
              required
              defaultValue={s.designation}
            />
            <TextInput
              name="sortOrder"
              type="number"
              label="Order"
              defaultValue={String(s.sortOrder)}
            />
            <div className="space-y-1 pt-5">
              <Check name="active" label="In use" defaultChecked={s.active} />
              <Check
                name="isDefault"
                label="Default signatory"
                defaultChecked={s.isDefault}
              />
            </div>
          </Editor>
        ))}
        <AddForm
          action={saveSignatoryAction.bind(null, null)}
          submit="Add signatory"
        >
          <TextInput name="name" label="Name" required />
          <TextInput name="designation" label="Designation" required />
          <TextInput
            name="sortOrder"
            type="number"
            label="Order"
            defaultValue="99"
          />
          <div className="space-y-1 pt-5">
            <Check name="active" label="In use" defaultChecked />
            <Check name="isDefault" label="Default signatory" />
          </div>
        </AddForm>
      </Section>

      <Section
        title="File class codes"
        intro="Used to generate new file references, e.g. RL in OGSERC/RL/002. Without a code, the reference must be typed."
      >
        {org.fileClasses.map((c) => (
          <Editor
            key={c.id}
            action={saveFileClassCodeAction.bind(null, c.id)}
            summary={
              <span>
                <span className={off(c.active)}>{c.label}</span>
                <span className="ml-2 font-mono text-xs">
                  {c.code ?? (
                    <span className="text-flagged font-sans">no code</span>
                  )}
                </span>
              </span>
            }
          >
            <TextInput
              name="code"
              label="Code"
              hint="Capital letters or digits, e.g. RL."
              defaultValue={c.code ?? ""}
            />
          </Editor>
        ))}
      </Section>
    </div>
  );
}
