"use client";
// Searchable picker for links (SPEC §9 R2): type part of a number, name or
// subject, then choose. Submits the chosen id in `name`, and its label in
// `${name}Label` so the form can show it again after a validation error.
import { useEffect, useId, useState, useTransition } from "react";
import type { PickerResult } from "@/app/(staff)/search-actions";
import { Field, inputClass } from "./form";

export function Picker({
  name,
  label,
  hint,
  search,
  defaultId,
  defaultLabel,
}: {
  name: string;
  label: string;
  hint?: string;
  search: (q: string) => Promise<PickerResult[]>;
  defaultId?: string;
  defaultLabel?: string;
}) {
  const [chosen, setChosen] = useState(
    defaultId ? { id: defaultId, label: defaultLabel ?? defaultId } : null,
  );
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [pending, start] = useTransition();
  const listId = useId();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(
      () => start(async () => setResults(await search(q))),
      250,
    );
    return () => clearTimeout(t);
  }, [q, search]);

  return (
    <Field label={label} hint={hint}>
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      <input type="hidden" name={`${name}Label`} value={chosen?.label ?? ""} />
      {chosen ? (
        <span className="flex items-center gap-3">
          <span className="font-mono text-sm">{chosen.label}</span>
          <button
            type="button"
            onClick={() => {
              setChosen(null);
              setQ("");
              setResults([]);
            }}
            className="text-xs text-neutral-600 underline"
          >
            Change
          </button>
        </span>
      ) : (
        <span className="relative block">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            placeholder="Type 2+ characters of a number, name or subject"
            aria-controls={listId}
            aria-label={`Search ${label}`}
            className={inputClass}
          />
          {(results.length > 0 || pending) && (
            <ul
              id={listId}
              role="listbox"
              aria-label={`${label} results`}
              className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-neutral-300 bg-white text-sm shadow"
            >
              {pending && (
                <li className="px-3 py-2 text-neutral-500">Searching…</li>
              )}
              {results.map((r) => (
                <li key={r.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => setChosen({ id: r.id, label: r.label })}
                    className="block w-full px-3 py-2 text-left hover:bg-neutral-100"
                  >
                    <span className="font-mono">{r.label}</span>
                    <span className="block text-xs text-neutral-600">
                      {r.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </Field>
  );
}
