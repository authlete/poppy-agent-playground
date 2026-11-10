// The Personal Agent: one @descope/poppy PoppyAgent that can drive any Poppy Company. The SDK handles
// the whole protocol (discovery, per-request Session JWT, Direct Sign-In, refresh, DPoP); these helpers
// expose each flow to the UI as plain JSON. Every HTTP call is routed through the wire log.
import { PoppyAgent, type Company, jwks, scopesNeeded } from "@descope/poppy";
import { ALLOW_PRIVATE, CLIENT_ID, DEFAULT_COMPANY, LOCAL_USER_ID, HOSTS_OWN_CIMD } from "./config";
import { clearWire, instrumentedFetch } from "./wire";
import type { CompanyView, Operation } from "./types";

// Module globals that survive Next HMR / route-module isolation: the agent singleton, a runtime
// "bring your own" identity, and the DPoP toggle.
const globals = globalThis as Record<string, unknown>;

/** Hide the issuer's DPoP support so the SDK requests Bearer tokens (DPoP is optional, spec 4.5). */
function withoutDpop(base: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await base(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/.well-known/oauth-authorization-server")) return res;
    const meta = (await res.clone().json()) as Record<string, unknown>;
    delete meta.dpop_signing_alg_values_supported;
    return Response.json(meta, { status: res.status });
  }) as typeof fetch;
}

interface AgentSingleton {
  agent: PoppyAgent;
  fetch: typeof fetch;
  website?: string;
  company?: Company;
  operations: Operation[];
}

/** Mint an ephemeral ES256 key, stable for this process (self-host without a configured key). */
async function generateKey(): Promise<JsonWebKey & { kid: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey & { kid: string };
  jwk.kid = crypto.randomUUID();
  return jwk;
}

/**
 * The agent's ES256 JWK from POPPY_AGENT_KEY (inline JWK). When self-hosting without it, a key is
 * generated and reused for the process; a fixed key is only needed for a bring-your-own CIMD or a
 * multi-instance deploy where every instance must sign alike.
 */
async function loadKey(): Promise<JsonWebKey & { kid: string }> {
  const inline = process.env.POPPY_AGENT_KEY;
  if (inline) return JSON.parse(inline);
  if (!HOSTS_OWN_CIMD) throw new Error("Set POPPY_AGENT_KEY for a bring-your-own CIMD");
  return (globals.__poppyKey ??= generateKey()) as Promise<JsonWebKey & { kid: string }>;
}

/** The public JWKS to serve at `jwks_uri` when self-hosting the CIMD doc. */
export async function jwksDocument() {
  const { kty, crv, x, y, kid } = await loadKey();
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty, crv, x, y },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return jwks([{ publicKey, kid }]);
}

interface Identity {
  clientId: string;
  jwk: JsonWebKey & { kid: string };
}

/** A runtime "bring your own" identity set from the UI, overriding the env/self-host default. */
function override(): Identity | undefined {
  return globals.__poppyIdentity as Identity | undefined;
}

async function create(): Promise<AgentSingleton> {
  const byo = override();
  const clientId = byo?.clientId ?? CLIENT_ID;
  if (!clientId)
    throw new Error("Set POPPY_CLIENT_ID (bring your own CIMD) or POPPY_AGENT_URL (self-host)");
  const jwk = byo?.jwk ?? (await loadKey());
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const base = instrumentedFetch();
  const wired = globals.__poppyNoDpop ? withoutDpop(base) : base;
  const agent = new PoppyAgent({
    clientId,
    signingKey: { privateKey, kid: jwk.kid },
    allowPrivateAddresses: ALLOW_PRIVATE,
    fetch: wired,
  });
  return { agent, fetch: wired, operations: [] };
}

function singleton(): Promise<AgentSingleton> {
  globals.__poppyAgent ??= create();
  return globals.__poppyAgent as Promise<AgentSingleton>;
}

/** Rebuild the agent from scratch (after an identity change): forget state, drop the singleton, clear the wire. */
async function rebuild(): Promise<void> {
  await reset();
  delete globals.__poppyAgent;
}

/** Switch to a bring-your-own CIMD identity (a client_id URL + its matching ES256 JWK). */
export async function setIdentity(clientId: string, keyJson: string): Promise<void> {
  if (new URL(clientId).protocol !== "https:") throw new Error("client_id must be an https URL");
  const jwk = JSON.parse(keyJson) as JsonWebKey & { kid: string };
  if (jwk.kty !== "EC" || !jwk.kid || !jwk.d) throw new Error("key must be a private EC JWK with a kid");
  globals.__poppyIdentity = { clientId, jwk };
  await rebuild();
}

/** Revert to the default identity (self-hosted, or POPPY_CLIENT_ID). */
export async function clearIdentity(): Promise<void> {
  delete globals.__poppyIdentity;
  await rebuild();
}

/** Toggle DPoP. Off → the SDK requests plain Bearer tokens (DPoP is optional, spec 4.5). */
export async function setDpop(enabled: boolean): Promise<void> {
  globals.__poppyNoDpop = !enabled;
  await rebuild();
}

function view(c: Company): CompanyView {
  const names = new Set([...Object.keys(c.scopes), ...Object.keys(c.scopeHints)]);
  return {
    name: c.name,
    domain: c.domain,
    issuer: c.identifier,
    signIn: { direct: c.signIn.direct, device: c.signIn.device, disabled: c.signIn.disabled },
    scopes: [...names].map((name) => ({
      name,
      description: c.scopes[name],
      changes: c.scopeHints[name]?.changes,
      personalData: c.scopeHints[name]?.personalData,
    })),
    apis: c.apis.map((a) => ({ type: a.type, url: a.url })),
  };
}

/** Read a Company's OpenAPI descriptions into a flat list of callable operations. */
async function readOperations(s: AgentSingleton, c: Company): Promise<Operation[]> {
  const ops: Operation[] = [];
  for (const api of c.apis) {
    if (api.type !== "openapi") continue;
    try {
      const spec = (await (await s.fetch(api.url)).json()) as {
        servers?: { url: string }[];
        paths?: Record<string, Record<string, { summary?: string; security?: Record<string, string[]>[] }>>;
      };
      const base = (spec.servers?.[0]?.url ?? `https://${c.domain}`).replace(/\/$/, "");
      for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of ["get", "post", "put", "patch", "delete"]) {
          const op = item[method];
          if (!op) continue;
          const scopes = [...new Set((op.security ?? []).flatMap((r) => Object.values(r).flat()))];
          ops.push({ method: method.toUpperCase(), path, url: `${base}${path}`, summary: op.summary, scopes });
        }
      }
    } catch {
      /* skip an API whose spec can't be read */
    }
  }
  return ops;
}

export async function getState() {
  const s = await singleton();
  const id = override();
  const identity = { clientId: id?.clientId ?? CLIENT_ID, selfHosted: !id && HOSTS_OWN_CIMD };
  const dpop = !globals.__poppyNoDpop;
  if (!s.company)
    return { discovered: false as const, defaultWebsite: DEFAULT_COMPANY, identity, dpop, signedIn: false, scope: [] as string[] };
  const user = await s.agent.user(s.company, LOCAL_USER_ID);
  return {
    discovered: true as const,
    defaultWebsite: DEFAULT_COMPANY,
    identity,
    dpop,
    website: s.website,
    company: view(s.company),
    operations: s.operations,
    signedIn: user.signedIn,
    scope: user.scope,
  };
}

/** Discover a Company and cache it with its operations (spec 3: validated domain↔issuer binding). */
export async function discover(website = DEFAULT_COMPANY) {
  const s = await singleton();
  const c = await s.agent.discover(website);
  s.company = c;
  s.website = website;
  s.operations = await readOperations(s, c);
  return { company: view(c), operations: s.operations };
}

async function currentCompany(): Promise<{ s: AgentSingleton; c: Company }> {
  const s = await singleton();
  if (!s.company) await discover();
  return { s, c: s.company! };
}

async function readResponse(response: Response) {
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* leave as text */
  }
  return { status: response.status, ok: response.ok, data };
}

/** Call any Company API endpoint. Signed-in unless `signedOut`; returns `needsSignIn` on a scope challenge. */
export async function callApi(input: {
  url: string;
  method?: string;
  body?: string;
  signedOut?: boolean;
}) {
  const { s, c } = await currentCompany();
  const user = await s.agent.user(c, LOCAL_USER_ID);
  const res = await user.session().fetch(input.url, {
    method: input.method ?? "GET",
    ...(input.signedOut ? { signedOut: true } : {}),
    ...(input.body ? { headers: { "content-type": "application/json" }, body: input.body } : {}),
  });
  const needed = scopesNeeded(res);
  if (needed !== undefined) {
    await res.body?.cancel();
    return { needsSignIn: true as const, scope: needed.split(" ").filter(Boolean) };
  }
  return { needsSignIn: false as const, ...(await readResponse(res)) };
}

/** Start Direct Sign-In. Defaults to every scope the Company advertises. */
export async function startSignIn(redirectUri: string, scope?: string[]) {
  const { s, c } = await currentCompany();
  const user = await s.agent.user(c, LOCAL_USER_ID);
  const scopes = scope?.length ? scope : Object.keys(c.scopes);
  return user.startDirectSignIn({ scope: scopes, redirectUri });
}

/** Finish Direct Sign-In from the callback URL (spec 4.2). */
export async function completeSignIn(callbackUrl: string) {
  const { s, c } = await currentCompany();
  return s.agent.completeDirectSignIn(c, callbackUrl);
}

export async function reset() {
  const s = await singleton();
  if (s.company) await s.agent.forget(s.company, LOCAL_USER_ID, { userIds: true });
  clearWire();
}
