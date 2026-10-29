"use client";
// Top-bar search: opens the Inward Register filtered by the text (number,
// sender, subject, references). Ctrl K (⌘K on a Mac) jumps to it.
import { useEffect, useRef } from "react";
import { Icon } from "./icons";

export function SearchBox() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      action="/inward"
      method="get"
      role="search"
      className="relative w-full max-w-[34rem]"
    >
      <Icon
        name="search"
        className="text-text-faint pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
      />
      <input
        ref={input}
        type="search"
        name="q"
        aria-label="Find in the inward register"
        aria-keyshortcuts="Control+K"
        placeholder="Search ACK numbers, senders, subjects…"
        className="rounded-control border-border bg-surface text-text placeholder:text-text-faint focus:border-accent focus:ring-accent h-11 w-full border pr-16 pl-10 text-sm focus:ring-1 focus:outline-none"
      />
      <kbd
        aria-hidden
        className="border-border text-text-muted pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[11px] sm:block"
      >
        Ctrl K
      </kbd>
    </form>
  );
}
