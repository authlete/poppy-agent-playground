"use client";

import { useEffect, useRef, useState } from "react";
import { AgentIdentity } from "@/components/AgentIdentity";
import { ApiCaller } from "@/components/ApiCaller";
import { WireLog } from "@/components/WireLog";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Button, Pill, Step } from "@/components/ui";
import { get, post, type Envelope } from "@/lib/client";
import { awaitSignIn, openSignInTab } from "@/lib/signin";
import type { CompanyView, Operation, WireEntry } from "@/lib/types";

interface Discovered {
  company: CompanyView;
  operations: Operation[];
  signedIn: boolean;
  granted: string[];
}

interface Identity {
  clientId: string;
  selfHosted: boolean;
}

const WEBSITE_KEY = "poppy:website";

export default function Page() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dpop, setDpop] = useState(true);
  const [defaultWebsite, setDefaultWebsite] = useState("");
  const [website, setWebsite] = useState("");
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [granted, setGranted] = useState<string[]>([]);
  const [entries, setEntries] = useState<WireEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const ran = useRef(false);
  const signinAbort = useRef<AbortController | null>(null);

  const logWire = (res: { wire?: WireEntry[] }) => {
    if (res.wire?.length) setEntries((prev) => [...prev, ...res.wire!]);
  };

  async function discover(site: string) {
    setBusy("discover");
    const res = await post<Discovered>("/api/discover", { website: site });
    logWire(res);
    if (res.ok && res.result) {
      const { company, operations, signedIn, granted } = res.result;
      setCompany(company);
      setOperations(operations);
      setSignedIn(signedIn);
      setGranted(granted);
      setWebsite(site);
      localStorage.setItem(WEBSITE_KEY, site);
    } else {
      setBanner(res.error ?? "Discovery failed");
    }
    setBusy(null);
  }

  // Load identity + DPoP choice and discover the last/default Company.
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const boot =
        await get<Envelope<{ identity: Identity; dpop: boolean; defaultWebsite: string }>>(
          "/api/bootstrap",
        );
      if (boot.result) {
        setIdentity(boot.result.identity);
        setDpop(boot.result.dpop);
        setDefaultWebsite(boot.result.defaultWebsite);
      }
      const site = localStorage.getItem(WEBSITE_KEY) || boot.result?.defaultWebsite;
      if (site) await discover(site);
    })();
  }, []);

  async function refreshIdentity() {
    const boot = await get<Envelope<{ identity: Identity; dpop: boolean }>>("/api/bootstrap");
    if (boot.result) {
      setIdentity(boot.result.identity);
      setDpop(boot.result.dpop);
    }
    setSignedIn(false);
    setGranted([]);
  }

  // Sign in through a new tab, so the main tab keeps all its state. Open it synchronously (or the
  // browser blocks it), then point it at the AS once /api/signin returns.
  async function signIn() {
    const tab = openSignInTab();
    if (!tab) {
      setBanner("Allow this site to open a tab, then try signing in again.");
      return;
    }
    setBusy("signin");
    setBanner(null);
    const res = await post<{ url: string }>("/api/signin", { website });
    logWire(res);
    if (!res.ok || !res.result) {
      tab.close();
      setBanner(res.error ?? "Could not start sign-in");
      setBusy(null);
      return;
    }
    tab.location.href = res.result.url;
    const controller = new AbortController();
    signinAbort.current = controller;
    try {
      const out = await awaitSignIn(tab, controller.signal);
      logWire(out); // the callback's wire: the code→token exchange
      setAuthCode(out.code ?? null);
      setBanner(out.ok ? "Signed in." : `Sign-in failed: ${out.message ?? ""}`);
      if (out.ok) await discover(website);
    } catch (err) {
      const msg = (err as Error).message;
      setBanner(msg === "cancelled" ? "Sign-in cancelled." : msg);
    } finally {
      signinAbort.current = null;
      setBusy(null);
    }
  }

  function cancelSignIn() {
    signinAbort.current?.abort();
  }

  async function callApi(input: {
    url: string;
    method: string;
    body?: string;
    signedOut?: boolean;
  }) {
    const res = await post<{ signedIn: boolean; granted: string[] }>("/api/call", {
      website,
      ...input,
    });
    logWire(res);
    if (res.ok && res.result) {
      setSignedIn(res.result.signedIn);
      setGranted(res.result.granted);
    }
    return res;
  }

  // Sign out: drop this browser's session (new User ID next time). The wire has its own Clear.
  async function signOut() {
    await post("/api/reset", {});
    setBanner(null);
    setSignedIn(false);
    setGranted([]);
    setAuthCode(null);
  }

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6">
        <Header discovered={!!company} signedIn={signedIn} onSignOut={signOut} />
        {banner ? (
          <div className="rounded-md border border-line-2 bg-base px-4 py-2 text-[13px] text-ink-2">
            {banner}
          </div>
        ) : null}

        <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
          <div className="flex min-w-0 flex-col gap-3">
            <AgentIdentity identity={identity} dpop={dpop} onChange={refreshIdentity} />

            <Connect
              website={website || defaultWebsite}
              busy={busy === "discover"}
              onDiscover={discover}
              company={company}
            />

            {company ? (
              <Step n={2} title="Sign in">
                {busy === "signin" ? (
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-muted">Signing in…</span>
                    <button
                      onClick={cancelSignIn}
                      className="rounded-md border border-line-2 bg-base px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <Button onClick={signIn} primary>
                    {signedIn ? "Sign in again" : `Sign in to ${company.name}`}
                  </Button>
                )}
                <p className="text-[12px] text-muted">
                  Requests:{" "}
                  <span className="font-mono text-ink-2">
                    {company.scopes.map((s) => s.name).join(" ")}
                  </span>
                </p>
                {signedIn ? (
                  <p className="text-[13px] text-ok">
                    Signed in · granted: {granted.join(", ") || "—"}
                  </p>
                ) : null}
                {authCode ? (
                  <p className="font-mono text-[11px] text-faint">
                    auth code: {authCode.slice(0, 16)}… (exchanged for tokens — see Wire)
                  </p>
                ) : null}
              </Step>
            ) : null}

            {company ? (
              <Step n={3} title="Call an API">
                <ApiCaller operations={operations} signedIn={signedIn} onCall={callApi} />
              </Step>
            ) : null}
          </div>

          <aside className="overflow-hidden rounded-lg border border-line bg-base">
            <WireLog entries={entries} onClear={() => setEntries([])} />
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function Header({
  discovered,
  signedIn,
  onSignOut,
}: {
  discovered: boolean;
  signedIn: boolean;
  onSignOut: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-ink">Poppy Agent Playground</h1>
        <p className="text-[13px] text-muted">
          Point a Personal Agent at any Poppy Company and drive the protocol end to end.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Pill on={discovered}>{discovered ? "Discovered" : "Not discovered"}</Pill>
        <Pill on={signedIn}>{signedIn ? "Signed in" : "Signed out"}</Pill>
        {signedIn ? (
          <button
            onClick={onSignOut}
            className="rounded-md border border-line-2 bg-base px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}

function Connect({
  website,
  busy,
  onDiscover,
  company,
}: {
  website: string;
  busy: boolean;
  onDiscover: (website: string) => void;
  company: CompanyView | null;
}) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(website), [website]);
  return (
    <Step n={1} title="Connect to a Company">
      <div className="flex w-full flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="company.example.com"
          className="min-w-0 flex-1 rounded-md border border-line-2 bg-base px-3 py-2 font-mono text-[13px] text-ink"
        />
        <Button onClick={() => onDiscover(value)} busy={busy} primary>
          Discover
        </Button>
      </div>
      {company ? <CompanyCard c={company} /> : null}
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
