"use client";

import { useEffect, useState } from "react";
import { AgentIdentity } from "@/components/AgentIdentity";
import { ApiCaller } from "@/components/ApiCaller";
import { WireLog } from "@/components/WireLog";
import { Button, Pill, Step } from "@/components/ui";
import { get, post, type Envelope } from "@/lib/client";
import type { CompanyView, Operation, WireEntry } from "@/lib/types";

interface State {
  discovered: boolean;
  defaultWebsite: string;
  website?: string;
  company?: CompanyView;
  operations?: Operation[];
  identity?: { clientId: string; selfHosted: boolean };
  signedIn: boolean;
  scope: string[];
}

export default function Page() {
  const [state, setState] = useState<State>({
    discovered: false,
    defaultWebsite: "",
    signedIn: false,
    scope: [],
  });
  const [entries, setEntries] = useState<WireEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const refreshState = async () => setState((await get<Envelope<State>>("/api/state")).result!);
  const refreshLog = async () => setEntries((await get<{ entries: WireEntry[] }>("/api/log")).entries);
  const refresh = async () => {
    await refreshState();
    await refreshLog();
  };

  // Load state, show the sign-in outcome, and keep the wire live.
  useEffect(() => {
    refresh();
    const params = new URL(window.location.href).searchParams;
    const signin = params.get("signin");
    if (signin === "ok") setBanner("Signed in.");
    if (signin === "error") setBanner(`Sign-in failed: ${params.get("msg") ?? ""}`);
    if (signin) window.history.replaceState({}, "", "/");
    const timer = setInterval(refreshLog, 1500);
    return () => clearInterval(timer);
  }, []);

  async function discover(website: string) {
    setBusy("discover");
    const res = await post("/api/discover", { website });
    if (!res.ok) setBanner(res.error ?? "Discovery failed");
    await refresh();
    setBusy(null);
  }

  async function signIn() {
    setBusy("signin");
    const res = await post<{ url: string }>("/api/signin");
    if (res.ok && res.result) window.location.href = res.result.url;
    else {
      setBanner(res.error ?? "Could not start sign-in");
      setBusy(null);
    }
  }

  async function reset() {
    await post("/api/reset");
    setBanner(null);
    await refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <Header state={state} onReset={reset} />
      {banner ? (
        <div className="rounded-md border border-line-2 bg-base px-4 py-2 text-[13px] text-ink-2">
          {banner}
        </div>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_minmax(360px,460px)]">
        <div className="flex flex-col gap-3">
          <AgentIdentity identity={state.identity} onChange={refresh} />

          <Connect state={state} busy={busy === "discover"} onDiscover={discover} />

          {state.company ? (
            <Step n={2} title="Sign in">
              <Button onClick={signIn} busy={busy === "signin"} primary>
                {state.signedIn ? "Sign in again" : `Sign in to ${state.company.name}`}
              </Button>
              <p className="text-[12px] text-muted">
                Requests:{" "}
                <span className="font-mono text-ink-2">
                  {state.company.scopes.map((s) => s.name).join(" ")}
                </span>
              </p>
              {state.signedIn ? (
                <p className="text-[13px] text-ok">Signed in · granted: {state.scope.join(", ") || "—"}</p>
              ) : null}
            </Step>
          ) : null}

          {state.company ? (
            <Step n={3} title="Call an API">
              <ApiCaller operations={state.operations ?? []} signedIn={state.signedIn} onCall={refresh} />
            </Step>
          ) : null}
        </div>

        <aside className="overflow-hidden rounded-lg border border-line bg-base">
          <WireLog entries={entries} />
        </aside>
      </div>
    </div>
  );
}

function Header({ state, onReset }: { state: State; onReset: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-ink">Poppy Agent Playground</h1>
        <p className="text-[13px] text-muted">
          Point a Personal Agent at any Poppy Company and drive the protocol end to end.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Pill on={state.discovered}>{state.discovered ? "Discovered" : "Not discovered"}</Pill>
        <Pill on={state.signedIn}>{state.signedIn ? "Signed in" : "Signed out"}</Pill>
        <button
          onClick={onReset}
          className="rounded-md border border-line-2 bg-base px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
        >
          Reset
        </button>
      </div>
    </header>
  );
}

function Connect({
  state,
  busy,
  onDiscover,
}: {
  state: State;
  busy: boolean;
  onDiscover: (website: string) => void;
}) {
  const [website, setWebsite] = useState("");
  const value = website || state.website || state.defaultWebsite;
  return (
    <Step n={1} title="Connect to a Company">
      <div className="flex w-full flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="company.example.com"
          className="min-w-0 flex-1 rounded-md border border-line-2 bg-base px-3 py-2 font-mono text-[13px] text-ink"
        />
        <Button onClick={() => onDiscover(value)} busy={busy} primary>
          Discover
        </Button>
      </div>
      {state.company ? <CompanyCard c={state.company} /> : null}
    </Step>
  );
}

function CompanyCard({ c }: { c: CompanyView }) {
  return (
    <div className="w-full rounded-md border border-line bg-surface p-3 text-[13px]">
      <div className="font-medium text-ink">{c.name}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink-2">
        <dt className="text-faint">domain</dt>
        <dd>{c.domain}</dd>
        <dt className="text-faint">issuer</dt>
        <dd className="break-all">{c.issuer}</dd>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1">
        {c.scopes.map((s) => (
          <span
            key={s.name}
            title={s.description}
            className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2"
          >
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
