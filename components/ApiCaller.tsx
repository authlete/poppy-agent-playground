"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { post, type Envelope } from "@/lib/client";
import type { Operation } from "@/lib/types";

/** The list of a Company's API operations, plus a panel to call the selected one. */
export function ApiCaller({
  operations,
  signedIn,
  onCall,
}: {
  operations: Operation[];
  signedIn: boolean;
  onCall: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Operation | null>(null);
  const [body, setBody] = useState("{}");
  const [signedOut, setSignedOut] = useState(false);
  const [result, setResult] = useState<Envelope<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  function select(op: Operation) {
    setSelected(op);
    setSignedOut(op.scopes.length === 0);
    setBody(op.bodyExample ?? "{}");
    setResult(null);
  }

  async function send() {
    if (!selected) return;
    setBusy(true);
    const res = await post("/api/call", {
      url: selected.url,
      method: selected.method,
      signedOut,
      ...(selected.method === "GET" ? {} : { body }),
    });
    setResult(res);
    await onCall();
    setBusy(false);
  }

  if (operations.length === 0)
    return <p className="text-[13px] text-muted">This Company publishes no OpenAPI endpoints.</p>;

  return (
    <div className="flex w-full flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {operations.map((op) => (
          <li key={`${op.method} ${op.path}`}>
            <button
              onClick={() => select(op)}
              className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left hover:bg-surface-2 ${
                selected === op ? "border-primary/40 bg-surface" : "border-line"
              }`}
            >
              <span className="w-12 shrink-0 font-mono text-[11px] font-semibold text-ink-2">
                {op.method}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                {op.path}
              </span>
              {op.scopes.length > 0 ? (
                <span className="shrink-0 font-mono text-[10px] text-faint">
                  {op.scopes.join(" ")}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-muted">signed-out</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
          <div className="font-mono text-[12px] text-ink-2">
            {selected.method} {selected.url}
          </div>
          {selected.method !== "GET" ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-line-2 bg-base p-2 font-mono text-[12px] text-ink"
            />
          ) : null}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={signedOut}
                onChange={(e) => setSignedOut(e.target.checked)}
              />
              Send signed-out
            </label>
            <Button onClick={send} busy={busy} primary>
              Send
            </Button>
          </div>
          {!signedIn && !signedOut && selected.scopes.length > 0 ? (
            <p className="text-[12px] text-muted">
              Not signed in — this will report the scopes needed.
            </p>
          ) : null}
          <Result r={result ?? undefined} />
        </div>
      ) : null}
    </div>
  );
}

function Result({ r }: { r?: Envelope<unknown> }) {
  if (!r) return null;
  if (!r.ok)
    return (
      <p className="break-words text-[13px] text-danger">
        {r.code ? `${r.code}: ` : ""}
        {r.error}
      </p>
    );
  const result = r.result as { needsSignIn?: boolean; scope?: string[]; data?: unknown };
  if (result?.needsSignIn)
    return <p className="text-[13px] text-ink-2">Needs sign-in for: {result.scope?.join(", ")}</p>;
  const data = result?.data ?? result;
  return (
    <pre className="max-h-72 w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-[11px] text-ink-2">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
