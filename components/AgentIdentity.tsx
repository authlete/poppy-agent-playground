"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { post } from "@/lib/client";

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The agent's own CIMD identity: shown prominently, and switchable to a bring-your-own CIMD. */
export function AgentIdentity({
  identity,
  dpop,
  onChange,
}: {
  identity?: { clientId: string; selfHosted: boolean };
  dpop: boolean;
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!identity) return null;

  async function apply(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const res = await post("/api/identity", body);
    if (!res.ok) {
      setErr(res.error ?? "Could not set identity");
      setBusy(false);
      return;
    }
    setEditing(false);
    setClientId("");
    setKey("");
    await onChange();
    setBusy(false);
  }

  return (
    <section className="rounded-lg border border-line bg-base p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Agent identity</h2>
            <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted">
              {identity.selfHosted ? "self-hosted" : "external"}
            </span>
          </div>
          <a
            href={identity.selfHosted ? "/client-metadata.json" : identity.clientId}
            target="_blank"
            rel="noreferrer"
            title={identity.clientId}
            className="mt-0.5 block truncate font-mono text-[12px] text-ink-2 hover:underline"
          >
            {host(identity.clientId)}
          </a>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 text-[12px] text-muted hover:text-ink-2"
          >
            Set your own
          </button>
        ) : null}
      </div>

      <label className="mt-3 flex items-center justify-between gap-2 text-[12px] text-muted">
        Sender-constrained tokens (DPoP)
        <input
          type="checkbox"
          checked={dpop}
          onChange={async (e) => {
            await post("/api/dpop", { enabled: e.target.checked });
            await onChange();
          }}
        />
      </label>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="https://your-host/client-metadata.json"
            className="w-full rounded-md border border-line-2 bg-base px-2 py-1.5 font-mono text-[12px] text-ink"
          />
          <textarea
            value={key}
            onChange={(e) => setKey(e.target.value)}
            rows={3}
            placeholder='Private ES256 JWK, e.g. {"kty":"EC","crv":"P-256","d":"…","x":"…","y":"…","kid":"…"}'
            className="w-full rounded-md border border-line-2 bg-base p-2 font-mono text-[12px] text-ink"
          />
          {err ? <p className="text-[12px] text-danger">{err}</p> : null}
          <div className="flex items-center gap-3">
            <Button onClick={() => apply({ clientId, key })} busy={busy} primary>
              Use this identity
            </Button>
            <button
              onClick={() => {
                setEditing(false);
                setErr(null);
              }}
              className="text-[12px] text-muted hover:text-ink-2"
            >
              Cancel
            </button>
            {!identity.selfHosted ? (
              <button
                onClick={() => apply({ reset: true })}
                className="ml-auto text-[12px] text-muted hover:text-ink-2"
              >
                Revert to self-hosted
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-faint">
            Any CIMD URL and its private key — e.g. create one at{" "}
            <a href="https://makeclient.dev" target="_blank" rel="noreferrer" className="underline">
              makeclient.dev
            </a>
            .
          </p>
        </div>
      ) : null}
    </section>
  );
}
