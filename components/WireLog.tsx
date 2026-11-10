"use client";

import { useState, type ReactNode } from "react";
import type { DecodedJwt, WireEntry } from "@/lib/types";

function Tag({ children, accent }: { children: ReactNode; accent?: boolean }) {
  const tone = accent ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted";
  return (
    <span
      className={`shrink-0 rounded-sm px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide ${tone}`}
    >
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

// A labelled block in the decoded panel; `highlight` tints it in the primary accent (for DPoP).
function Section({
  title,
  highlight,
  children,
}: {
  title: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-2 ${highlight ? "rounded-md border border-primary/20 bg-primary/5 p-2" : ""}`}
    >
      <div className={`text-[11px] font-medium ${highlight ? "text-primary" : "text-muted"}`}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
      {children}
    </dl>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  const text = typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <>
      <dt className="text-faint">{k}</dt>
      <dd className="break-all text-ink-2">{text}</dd>
    </>
  );
}

function Claims({
  title,
  jwt,
  highlight,
}: {
  title: string;
  jwt: DecodedJwt;
  highlight?: boolean;
}) {
  return (
    <Section title={title} highlight={highlight}>
      <Rows>
        {jwt.header.typ ? <Field k="typ" v={jwt.header.typ} /> : null}
        {Object.entries(jwt.claims).map(([k, v]) => (
          <Field key={k} k={k} v={v} />
        ))}
      </Rows>
    </Section>
  );
}

/** The AS token response: the granted `scope` and `token_type` (Bearer vs DPoP). */
function TokenSummary({ preview }: { preview: string }) {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(preview);
  } catch {
    return null;
  }
  if (!obj || (obj.token_type === undefined && obj.access_token === undefined)) return null;
  const shown = ["token_type", "scope", "expires_in"].filter((k) => obj[k] !== undefined);
  return (
    <Section title="token response" highlight>
      <Rows>
        {shown.map((k) => (
          <Field key={k} k={k} v={obj[k]} />
        ))}
      </Rows>
    </Section>
  );
}

function Row({ e }: { e: WireEntry }) {
  const [open, setOpen] = useState(false);
  const { path, host } = parts(e.url);
  const token = e.reqHeaders["authorization"];
  const scheme = token?.split(" ")[0] ?? "";
  const isDpop = scheme.toLowerCase() === "dpop";
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
        {token ? <Tag accent={isDpop}>{scheme.toLowerCase()}</Tag> : null}
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
          <div className="break-all font-mono text-[11px] text-faint">{host}</div>
          {e.error ? <div className="mt-1 text-[11px] text-danger">{e.error}</div> : null}
          {token ? (
            <Section title="access token">
              <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
                <Tag accent={isDpop}>{scheme}</Tag>
                <span className="break-all text-ink-2">{token}</span>
              </div>
              {isDpop ? (
                <div className="mt-0.5 text-[10px] text-primary">
                  Sender-constrained to the agent&apos;s key (DPoP, RFC 9449).
                </div>
              ) : null}
            </Section>
          ) : null}
          {e.dpopProof ? (
            <Claims title="DPoP proof (sender-constrained)" jwt={e.dpopProof} highlight />
          ) : null}
          {e.reqBody ? (
            <Section title="request body">
              <Rows>
                {Object.entries(e.reqBody).map(([k, v]) => (
                  <Field key={k} k={k} v={v} />
                ))}
              </Rows>
            </Section>
          ) : null}
          {e.clientAssertion ? (
            <Claims title="client_assertion (private_key_jwt)" jwt={e.clientAssertion} />
          ) : null}
          {e.poppySession ? <Claims title="Poppy-Session" jwt={e.poppySession} /> : null}
          {e.delegation ? <Claims title="poppy_dlg (delegation)" jwt={e.delegation} /> : null}
          {e.respPreview ? <TokenSummary preview={e.respPreview} /> : null}
          {e.respPreview ? (
            <Section title="response">
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-surface-2 p-2 font-mono text-[11px] text-ink-2">
                {e.respPreview}
              </pre>
            </Section>
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
          <p className="mt-0.5 text-[11px] text-muted">
            Click a call to decode its headers and JWTs.
          </p>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted">
          Every call the agent makes to the Company and its authorization server appears here —
          decoded.
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
