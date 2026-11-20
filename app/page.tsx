"use client";

import { useEffect, useRef, useState } from "react";
import { AgentView } from "@/components/AgentView";
import { WireLog } from "@/components/WireLog";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Button } from "@/components/ui";
import { get, post, type Envelope } from "@/lib/client";
import { awaitSignIn, openSignInTab } from "@/lib/signin";
import type { AgentMsg, CompanyView, Operation, Task, WireEntry } from "@/lib/types";

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

interface CallResult {
  signedIn: boolean;
  granted: string[];
  needsSignIn?: boolean;
  scope?: string[];
  ok?: boolean;
  status?: number;
  data?: unknown;
}

const WEBSITE_KEY = "poppy:website";
let msgSeq = 0;
const mid = () => `m${msgSeq++}`;

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
  const [transcript, setTranscript] = useState<AgentMsg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const ran = useRef(false);
  const signinAbort = useRef<AbortController | null>(null);

  type NewMsg =
    | { role: "user"; text: string }
    | { role: "agent"; text: string; data?: unknown; tone?: "ok" | "denied" | "info" };
  const say = (m: NewMsg) => setTranscript((prev) => [...prev, { ...m, id: mid() }]);
  const logWire = (res: { wire?: WireEntry[] }) => {
    if (res.wire?.length) setEntries((prev) => [...prev, ...res.wire!]);
  };

  async function discover(site: string) {
    setBusy("discover");
    const res = await post<Discovered>("/api/discover", { website: site });
    if (res.ok && res.result) {
      const fresh = !company || company.domain !== res.result.company.domain;
      setCompany(res.result.company);
      setOperations(res.result.operations);
      setSignedIn(res.result.signedIn);
      setGranted(res.result.granted);
      setWebsite(site);
      localStorage.setItem(WEBSITE_KEY, site);
      setBanner(null);
      // A new Company starts a clean view; re-discovering the same one keeps the history.
      if (fresh) {
        setTranscript([]);
        setEntries(res.wire ?? []);
      } else {
        logWire(res);
      }
    } else {
      logWire(res);
      setBanner(res.error ?? "Discovery failed");
    }
    setBusy(null);
  }

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

  // Sign in through a new tab, so the main tab keeps all its state.
  async function signIn() {
    if (!company) return;
    say({ role: "user", text: `Sign in to ${company.name}` });
    const tab = openSignInTab();
    if (!tab) {
      say({
        role: "agent",
        tone: "denied",
        text: "Allow this site to open a tab, then try again.",
      });
      return;
    }
    setBusy("signin");
    const res = await post<{ url: string }>("/api/signin", { website });
    logWire(res);
    if (!res.ok || !res.result) {
      tab.close();
      say({ role: "agent", tone: "denied", text: res.error ?? "Could not start sign-in." });
      setBusy(null);
      return;
    }
    tab.location.href = res.result.url;
    const controller = new AbortController();
    signinAbort.current = controller;
    try {
      const out = await awaitSignIn(tab, controller.signal);
      logWire(out);
      if (out.ok) {
        await discover(website);
        say({
          role: "agent",
          tone: "ok",
          text: `Signed in. ${company.name} granted me the access you approved.`,
        });
      } else {
        say({ role: "agent", tone: "denied", text: `Sign-in failed. ${out.message ?? ""}` });
      }
    } catch (err) {
      const msg = (err as Error).message;
      say({
        role: "agent",
        tone: "denied",
        text: msg === "cancelled" ? "Sign-in cancelled." : msg,
      });
    } finally {
      signinAbort.current = null;
      setBusy(null);
    }
  }

  async function callApi(op: Operation) {
    const signedOut = op.scopes.length === 0;
    const res = await post<CallResult>("/api/call", {
      website,
      url: op.url,
      method: op.method,
      signedOut,
      ...(op.method === "GET" ? {} : { body: op.bodyExample ?? "{}" }),
    });
    logWire(res);
    if (res.ok && res.result) {
      setSignedIn(res.result.signedIn);
      setGranted(res.result.granted);
    }
    return res;
  }

  async function runOp(op: Operation) {
    if (!company) return;
    say({ role: "user", text: labelFor(op) });
    setBusy("call");
    const res = await callApi(op);
    setBusy(null);
    const r = res.result;
    if (!res.ok || !r) {
      say({ role: "agent", tone: "denied", text: res.error ?? "That request failed." });
      return;
    }
    if (r.needsSignIn) {
      say({
        role: "agent",
        tone: "info",
        text: `You're not signed in. ${company.name} needs ${(r.scope ?? []).join(" ")} for this, so sign in first.`,
      });
      return;
    }
    if (r.ok === false) {
      const err = (r.data as { error?: string })?.error ?? `HTTP ${r.status}`;
      say({ role: "agent", tone: "denied", text: `${company.name} refused: ${err}.` });
      return;
    }
    say({
      role: "agent",
      tone: op.method === "GET" ? undefined : "ok",
      text: op.method === "GET" ? "Here's what I got back:" : "Done.",
      data: r.data,
    });
  }

  function cancelSignIn() {
    signinAbort.current?.abort();
  }

  async function signOut() {
    await post("/api/reset", {});
    setSignedIn(false);
    setGranted([]);
    say({ role: "agent", tone: "info", text: "Signed out. Next time I'll be a brand-new User." });
  }

  const tasks = buildTasks(company, operations, signedIn, runOp, signIn);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6">
        <TopBar
          title="Poppy Agent Playground"
          website={website || defaultWebsite}
          busy={busy === "discover"}
          onDiscover={discover}
        />
        {banner ? (
          <div className="rounded-md border border-line-2 bg-base px-4 py-2 text-[13px] text-ink-2">
            {banner}
          </div>
        ) : null}

        {company ? (
          <div className="grid flex-1 items-stretch gap-4 lg:grid-cols-2">
            <AgentView
              company={company}
              signedIn={signedIn}
              granted={granted}
              transcript={transcript}
              tasks={tasks}
              busy={busy}
              identity={identity}
              dpop={dpop}
              onIdentityChange={refreshIdentity}
              onSignOut={signOut}
              onCancelSignIn={cancelSignIn}
            />
            <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-line bg-base">
              {busy === "signin" ? <SignInPreview company={company} /> : null}
              <WireLog entries={entries} onClear={() => setEntries([])} />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Connecting to a Company…</p>
        )}
      </div>
      <SiteFooter />
    </>
  );
}

function labelFor(op: Operation): string {
  return op.summary || `${op.method} ${op.path}`;
}

function buildTasks(
  company: CompanyView | null,
  operations: Operation[],
  signedIn: boolean,
  runOp: (op: Operation) => void,
  signIn: () => void,
): Task[] {
  if (!company) return [];
  const publicRead = operations.find((o) => o.method === "GET" && o.scopes.length === 0);
  const scopedRead = operations.find((o) => o.method === "GET" && o.scopes.length > 0);
  const write = operations.find((o) => o.method !== "GET");
  const tasks: Task[] = [];
  if (publicRead)
    tasks.push({ id: "pub", label: labelFor(publicRead), run: () => runOp(publicRead) });
  if (!signedIn && company.signIn.direct)
    tasks.push({ id: "signin", label: `Sign in to ${company.name}`, run: signIn });
  if (scopedRead)
    tasks.push({
      id: "read",
      label: labelFor(scopedRead),
      hint: scopedRead.scopes.join(" "),
      run: () => runOp(scopedRead),
    });
  if (write)
    tasks.push({
      id: "write",
      label: labelFor(write),
      hint: write.scopes.join(" "),
      run: () => runOp(write),
    });
  return tasks;
}

/** The branded hand-off moment: the Company's own sign-in page, on its own domain, Authlete invisible. */
function SignInPreview({ company }: { company: CompanyView }) {
  let host = company.issuer;
  try {
    host = new URL(company.issuer).host;
  } catch {}
  return (
    <div className="border-b border-line bg-surface px-4 py-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        On the Company&apos;s own page
      </div>
      <div className="rounded-lg border border-line bg-base p-4">
        <div className="text-[15px] font-semibold text-ink">{company.name}</div>
        <div className="mt-0.5 text-[12px] text-muted">Sign in to continue</div>
        <ul className="mt-3 flex flex-col gap-1">
          {company.scopes.map((s) => (
            <li key={s.name} className="text-[12px] text-ink-2">
              <span className="font-mono text-[11px] text-primary">{s.name}</span>
              {s.description ? <span className="text-muted"> — {s.description}</span> : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="rounded-md border border-line-2 px-3 py-1.5 text-[12px] text-muted">
            Deny
          </span>
          <span className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-ink">
            Approve
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-faint">
        This page is <span className="font-mono text-ink-2">{host}</span> — {company.name}&apos;s
        own authorization server. Authlete powers it, invisibly. The sign-in opens in a new tab; the
        requests appear below.
      </p>
    </div>
  );
}

function TopBar({
  title,
  website,
  busy,
  onDiscover,
}: {
  title: string;
  website: string;
  busy: boolean;
  onDiscover: (website: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(website), [website]);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="text-[13px] text-muted">
          See the authorization behind a Personal Agent as it signs in to a Poppy Company and calls
          its APIs.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="company.example.com"
          className="w-56 rounded-md border border-line-2 bg-base px-3 py-2 font-mono text-[12px] text-ink"
        />
        <Button onClick={() => onDiscover(value)} busy={busy} primary>
          Discover
        </Button>
      </div>
    </header>
  );
}
