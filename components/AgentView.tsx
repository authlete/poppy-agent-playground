"use client";

import { type ReactNode } from "react";
import { AgentIdentity } from "@/components/AgentIdentity";
import type { AgentMsg, CompanyView, Task } from "@/lib/types";

/** The left pane: "what the User sees". A relatable agent view, with guided tasks that drive the
 *  protocol. The decoded authorization lives in the right pane. */
export function AgentView({
  company,
  signedIn,
  granted,
  transcript,
  tasks,
  busy,
  identity,
  dpop,
  onIdentityChange,
  onSignOut,
  onCancelSignIn,
}: {
  company: CompanyView;
  signedIn: boolean;
  granted: string[];
  transcript: AgentMsg[];
  tasks: Task[];
  busy: string | null;
  identity: { clientId: string; selfHosted: boolean } | null;
  dpop: boolean;
  onIdentityChange: () => Promise<void>;
  onSignOut: () => void;
  onCancelSignIn: () => void;
}) {
  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-line bg-base">
      {/* Agent header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">Your agent</div>
          <div className="truncate text-[12px] text-muted">
            {signedIn ? `Signed in to ${company.name}` : `Connected to ${company.name}`}
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            signedIn ? "border-ok/30 bg-ok/10 text-ok" : "border-line-2 bg-surface-2 text-muted"
          }`}
        >
          {signedIn ? "signed in" : "signed out"}
        </span>
        {signedIn ? (
          <button onClick={onSignOut} className="text-[12px] text-muted hover:text-ink-2">
            Sign out
          </button>
        ) : null}
      </div>

      {/* Transcript */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {transcript.length === 0 ? (
          <Intro company={company} />
        ) : (
          transcript.map((m) => <Bubble key={m.id} m={m} />)
        )}
        {busy && busy !== "discover" ? (
          <Working label={busy} onCancel={busy === "signin" ? onCancelSignIn : undefined} />
        ) : null}
      </div>

      {/* Guided tasks */}
      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          Ask the agent
        </div>
        <div className="flex flex-wrap gap-2">
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={t.run}
              disabled={t.disabled || !!busy}
              title={t.hint}
              className="rounded-full border border-line-2 bg-surface px-3 py-1.5 text-[12px] text-ink-2 hover:bg-surface-2 disabled:opacity-40"
            >
              {t.label}
            </button>
          ))}
        </div>
        {granted.length > 0 ? (
          <p className="mt-2 text-[11px] text-faint">
            Granted: <span className="font-mono text-ink-2">{granted.join(" ")}</span>
          </p>
        ) : null}
      </div>

      {/* Agent settings, tucked away */}
      <details className="border-t border-line">
        <summary className="cursor-pointer list-none px-4 py-2 text-[12px] text-muted hover:text-ink-2">
          Agent settings · {identity?.selfHosted ? "self-hosted CIMD" : "your CIMD"} ·{" "}
          {dpop ? "DPoP" : "Bearer"}
        </summary>
        <div className="px-3 pb-3">
          <AgentIdentity identity={identity} dpop={dpop} onChange={onIdentityChange} />
        </div>
      </details>
    </div>
  );
}

function Avatar() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[15px]">
      🌸
    </span>
  );
}

function Intro({ company }: { company: CompanyView }) {
  return (
    <p className="text-[13px] text-muted">
      Pick a task below. The agent runs each one as a real request to {company.name}, decoded on the
      right.
    </p>
  );
}

function Working({ label, onCancel }: { label: string; onCancel?: () => void }) {
  const text = label === "signin" ? "Handing you to the Company's sign-in page…" : "Working…";
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      {text}
      {onCancel ? (
        <button onClick={onCancel} className="text-[12px] text-muted underline hover:text-ink-2">
          Cancel
        </button>
      ) : null}
    </div>
  );
}

function Bubble({ m }: { m: AgentMsg }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-[13px] text-base">
          {m.text}
        </div>
      </div>
    );
  }
  const tone =
    m.tone === "denied"
      ? "border-danger/30 bg-danger/5"
      : m.tone === "ok"
        ? "border-ok/30 bg-ok/5"
        : "border-line bg-surface";
  return (
    <div className="flex gap-2">
      <Avatar />
      <div className={`max-w-[85%] rounded-2xl rounded-bl-sm border px-3 py-2 ${tone}`}>
        <p className="text-[13px] text-ink-2">{m.text}</p>
        {m.data !== undefined ? <Result data={m.data} /> : null}
      </div>
    </div>
  );
}

/** Render an API response as something a person can read: the first array of records as cards,
 *  otherwise a few key fields. Company-agnostic. */
function Result({ data }: { data: unknown }) {
  const list = firstRecordArray(data);
  if (list) {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        {list.items.slice(0, 6).map((it, i) => (
          <Card key={i} rec={it} />
        ))}
      </div>
    );
  }
  if (isRecord(data)) {
    return (
      <div className="mt-2">
        <Card rec={data} />
      </div>
    );
  }
  return <pre className="mt-2 text-[11px] text-muted">{String(data)}</pre>;
}

function Card({ rec }: { rec: Record<string, unknown> }) {
  const { title, key } = pickTitle(rec);
  const fields = Object.entries(rec)
    .filter(
      ([k, v]) =>
        k !== key && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"),
    )
    .slice(0, title ? 4 : 5);
  return (
    <div className="rounded-lg border border-line bg-base px-3 py-2">
      {title ? <div className="text-[13px] font-medium text-ink">{title}</div> : null}
      <div
        className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted ${title ? "mt-0.5" : ""}`}
      >
        {fields.map(([k, v]) => (
          <span key={k}>
            <span className="text-faint">{k}</span>{" "}
            <span className="text-ink-2">{formatVal(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// A human-friendly heading for a record, if one of these fields reads as a name. Otherwise none,
// so a confirmation-style object shows its fields rather than a meaningless "Item".
function pickTitle(rec: Record<string, unknown>): { title: string; key: string } {
  for (const k of ["name", "title", "room", "confirmation", "reference"]) {
    const v = rec[k];
    if (typeof v === "string" || typeof v === "number") return { title: String(v), key: k };
  }
  return { title: "", key: "" };
}

function formatVal(v: unknown): ReactNode {
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstRecordArray(data: unknown): { key: string; items: Record<string, unknown>[] } | null {
  if (!isRecord(data)) return null;
  for (const [key, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length > 0 && isRecord(v[0])) {
      return { key, items: v as Record<string, unknown>[] };
    }
  }
  return null;
}
