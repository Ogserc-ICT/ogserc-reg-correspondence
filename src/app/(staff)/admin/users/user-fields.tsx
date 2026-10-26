"use client";
// The fields shared by "Add user" and "Edit user".
import { useState } from "react";
import { Field, inputClass } from "@/app/_components/form";
import { ROLE_LABELS, type Role } from "@/domain/permissions";

export type UnitOption = { id: string; name: string };

export type UserValues = {
  name?: string;
  email?: string;
  role?: string;
  unitId?: string;
  isSignatory?: boolean;
  designation?: string;
};

export function UserFields({
  units,
  values,
}: {
  units: UnitOption[];
  values: UserValues;
}) {
  const [role, setRole] = useState(values.role ?? "REGISTRY_OFFICER");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={values.name}
          className={inputClass}
        />
      </Field>
      <Field label="Email address" hint="They sign in with this.">
        <input
          name="email"
          type="email"
          required
          defaultValue={values.email}
          className={inputClass}
        />
      </Field>
      <Field label="Role">
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={inputClass}
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Unit"
        hint="Unit officers only: the unit whose items they see."
      >
        <select
          name="unitId"
          defaultValue={values.unitId ?? ""}
          disabled={role !== "UNIT_OFFICER"}
          className={inputClass}
        >
          <option value="">—</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Designation"
        hint="Printed under a signature, e.g. Secretary to the Commission."
      >
        <input
          name="designation"
          defaultValue={values.designation}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          name="isSignatory"
          defaultChecked={values.isSignatory}
        />
        Signs outgoing letters
      </label>
    </div>
  );
}
