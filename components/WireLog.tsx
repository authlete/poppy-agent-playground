"use client";

import { useState, type ReactNode } from "react";
import type { DecodedJwt, WireEntry } from "@/lib/types";

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

function statusColor(e: WireEntry): string {
  if (e.error) return "text-danger";
  if (e.status === undefined) return "text-muted";
  if (e.status >= 200 && e.status < 300) return "text-ok";
  if (e.status >= 400) return "text-danger";
  return "text-ink-2";
}

function parts(url: string): { path: string; host: string } {
  try {
    const u = new URL(url);
    return { path: u.pathname, host: u.host };
  } catch {
    return { path: url, host: "" };
  }
}

function Claims({ title, jwt }: { title: string; jwt: DecodedJwt }) {
  return (
    <div className="mt-2">
      <div className="text-[11px] font-medium text-muted">{title}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
        {jwt.header.typ ? (
          <>
            <dt className="text-faint">typ</dt>
            <dd className="text-ink-2 break-all">{String(jwt.header.typ)}</dd>
          </>
        ) : null}
        {Object.entries(jwt.claims).map(([k, v]) => (
          <Field key={k} k={k} v={v} />
        ))}
      </dl>
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  const text = typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <>
      <dt className="text-faint">{k}</dt>
      <dd className="text-ink-2 break-all">{text}</dd>
    </>
  );
}

function Row({ e }: { e: WireEntry }) {
  const [open, setOpen] = useState(false);
  const { path, host } = parts(e.url);
  const token = e.reqHeaders["authorization"];
  return (
    <li className="border-b border-line last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
      >
        <span
          className={`shrink-0 font-mono text-[10px] text-faint transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
        <span className="w-11 shrink-0 font-mono text-[11px] font-semibold text-ink-2">
          {e.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{path}</span>
        {e.poppySession ? <Tag>session</Tag> : null}
        {token ? <Tag>{token.split(" ")[0].toLowerCase()}</Tag> : null}
        <span className={`shrink-0 font-mono text-[11px] font-semibold ${statusColor(e)}`}>
          {e.error ? "ERR" : (e.status ?? "···")}
        </span>
        {e.durationMs !== undefined ? (
          <span className="w-12 shrink-0 text-right font-mono text-[10px] text-faint">
            {e.durationMs}ms
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-line bg-surface px-3 py-2">
          <div className="font-mono text-[11px] text-faint break-all">{host}</div>
          {e.error ? <div className="mt-1 text-[11px] text-danger">{e.error}</div> : null}
          {e.reqBody ? (
            <div className="mt-2">
              <div className="text-[11px] font-medium text-muted">request body</div>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                {Object.entries(e.reqBody).map(([k, v]) => (
                  <Field key={k} k={k} v={v} />
                ))}
              </dl>
            </div>
          ) : null}
          {e.clientAssertion ? <Claims title="client_assertion (private_key_jwt)" jwt={e.clientAssertion} /> : null}
          {e.poppySession ? <Claims title="Poppy-Session" jwt={e.poppySession} /> : null}
          {e.delegation ? <Claims title="poppy_dlg (delegation)" jwt={e.delegation} /> : null}
          {e.respPreview ? (
            <div className="mt-2">
              <div className="text-[11px] font-medium text-muted">response</div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-surface-2 p-2 font-mono text-[11px] text-ink-2">
                {e.respPreview}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function WireLog({ entries }: { entries: WireEntry[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Wire</h2>
          <span className="font-mono text-[11px] text-faint">{entries.length} calls</span>
        </div>
        {entries.length > 0 ? (
          <p className="mt-0.5 text-[11px] text-muted">Click a call to decode its headers and JWTs.</p>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted">
          Every call the agent makes to the Company and its Authlete AS appears here — decoded.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {entries.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
