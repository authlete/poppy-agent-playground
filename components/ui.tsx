import type { ReactNode } from "react";

/** A numbered step card. */
export function Step({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-base p-4">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[12px] text-faint">{n}</span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {desc ? <p className="mt-0.5 text-[13px] text-muted">{desc}</p> : null}
      <div className="mt-3 flex flex-col items-start gap-3">{children}</div>
    </section>
  );
}

export function Button({
  onClick,
  busy,
  primary,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        primary
          ? "rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-ink hover:opacity-90 disabled:opacity-50"
          : "rounded-md border border-line-2 bg-base px-4 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
      }
    >
      {busy ? "…" : children}
    </button>
  );
}

/** A small on/off status pill. */
export function Pill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        on ? "border-ok/30 bg-ok/10 text-ok" : "border-line-2 bg-surface-2 text-muted"
      }`}
    >
      {children}
    </span>
  );
}
