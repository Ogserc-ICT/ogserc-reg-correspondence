// Button looks, for <button>, <Link> and <a> alike. Controls are 44px tall.
const BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50";

const VARIANTS = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary:
    "border border-border bg-surface text-text hover:bg-surface-raised",
  ghost: "text-text-muted hover:bg-surface-raised hover:text-text",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClass(variant: ButtonVariant = "secondary", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${extra}`;
}
