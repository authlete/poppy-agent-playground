// The Personal Agent, built fresh for each request from the caller's encrypted session (see session.ts),
// so the playground holds no server-side state. The @descope/poppy SDK drives the whole protocol
// (discovery, per-request Session JWT, Direct Sign-In, refresh, DPoP); these helpers expose each flow to
// the routes as plain JSON, with every HTTP call routed through the request's Wire log.
import { PoppyAgent, type Company, discover, jwks, scopesNeeded, type Store } from "@descope/poppy";
import { ALLOW_PRIVATE, CLIENT_ID, HOSTS_OWN_CIMD } from "./config";
import type { SessionData } from "./session";
import type { Wire } from "./wire";
import type { CompanyView, Operation } from "./types";

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

/** Mint an ephemeral ES256 key, stable for this process (self-host locally without a configured key). */
async function generateKey(): Promise<JsonWebKey & { kid: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey & {
    kid: string;
  };
  jwk.kid = crypto.randomUUID();
  return jwk;
}

/**
 * The default self-hosted identity's ES256 JWK. From POPPY_AGENT_KEY (a fixed key, required on a
 * multi-instance deploy so every instance signs alike); generated and reused per process otherwise.
 */
function defaultJwk(): Promise<JsonWebKey & { kid: string }> {
  const inline = process.env.POPPY_AGENT_KEY;
  if (inline) return Promise.resolve(JSON.parse(inline));
  if (!HOSTS_OWN_CIMD) throw new Error("Set POPPY_AGENT_KEY for a bring-your-own CIMD");
  const g = globalThis as Record<string, unknown>;
  return (g.__poppyKey ??= generateKey()) as Promise<JsonWebKey & { kid: string }>;
}

const importSigning = (jwk: JsonWebKey) =>
  crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

/** The public JWKS to serve at `jwks_uri` for the self-hosted CIMD document. */
export async function jwksDocument() {
  const { kty, crv, x, y, kid } = await defaultJwk();
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty, crv, x, y },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return jwks([{ publicKey, kid }]);
}

// Cache public, dpop-independent metadata GETs per instance (the API spec and the resource metadata) so
// the SDK's resource resolver doesn't re-fetch them on every call. Served ahead of the wire, so each
// shows once and then stays quiet. Not the AS metadata — that is rewritten per request by the DPoP toggle.
const metaCache = new Map<string, { at: number; contentType: string; body: string }>();
const META_TTL = 5 * 60_000;
const isMetadata = (url: string) =>
  /(openapi(\.json)?|oauth-protected-resource)$/i.test(new URL(url).pathname);

function cacheMetadata(base: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? "GET").toUpperCase() !== "GET" || !isMetadata(url))
      return base(input, init);
    const hit = metaCache.get(url);
    if (hit && Date.now() - hit.at < META_TTL)
      return new Response(hit.body, { status: 200, headers: { "content-type": hit.contentType } });
    const res = await base(input, init);
    if (res.ok)
      metaCache.set(url, {
        at: Date.now(),
        contentType: res.headers.get("content-type") ?? "application/json",
        body: await res.clone().text(),
      });
    return res;
  }) as typeof fetch;
}

/** Build the agent for one request: its identity (BYO or the default self-hosted), DPoP choice, store,
 *  and a fetch wired to this request's log. */
export async function buildAgent(
  store: Store,
  session: SessionData,
  wire: Wire,
): Promise<PoppyAgent> {
  const clientId = session.identity?.clientId ?? CLIENT_ID;
  if (!clientId) throw new Error("Set POPPY_CLIENT_ID (bring your own CIMD) or POPPY_AGENT_URL");
  const jwk = session.identity?.jwk ?? (await defaultJwk());
  const privateKey = await importSigning(jwk);
  const fetch = cacheMetadata(session.dpop ? wire.fetch() : withoutDpop(wire.fetch()));
  return new PoppyAgent({
    clientId,
    signingKey: { privateKey, kid: jwk.kid },
    store,
    fetch,
    allowPrivateAddresses: ALLOW_PRIVATE,
  });
}

/** The effective identity shown in the UI (BYO overrides the default self-hosted CIMD). */
export function identityView(session: SessionData) {
  return {
    clientId: session.identity?.clientId ?? CLIENT_ID,
    selfHosted: !session.identity && HOSTS_OWN_CIMD,
  };
}

// Company metadata is public and the same for everyone, so cache it briefly (per instance) to keep
// signed-in API calls fast and the wire free of repeated discovery noise.
const companyCache = new Map<string, { company: Company; at: number }>();
const COMPANY_TTL = 5 * 60_000;

async function cachedCompany(website: string): Promise<Company> {
  const hit = companyCache.get(website);
  if (hit && Date.now() - hit.at < COMPANY_TTL) return hit.company;
  const company = await discover(website, { fetch, allowPrivateAddresses: ALLOW_PRIVATE });
  companyCache.set(website, { company, at: Date.now() });
  return company;
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

interface Schema {
  $ref?: string;
  type?: string;
  format?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
}

const deref = (s: Schema, defs: Record<string, Schema>): Schema =>
  s.$ref ? (defs[s.$ref.split("/").pop()!] ?? {}) : s;

/** A plausible value for a bare string, shaped by its format (and a light date-name hint). */
function sampleString(format: string | undefined, name: string): string {
  const iso = new Date().toISOString();
  if (format === "date" || /date/i.test(name)) return iso.slice(0, 10);
  if (format === "date-time") return iso;
  if (format === "email") return "user@example.com";
  if (format === "uri" || format === "url") return "https://example.com";
  return "example";
}

/** A ready-to-send value for a property: its own example/default/enum, else one shaped by type. */
function sampleValue(schema: Schema, defs: Record<string, Schema>, name: string): unknown {
  const s = deref(schema, defs);
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  switch (s.type) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return s.items ? [sampleValue(s.items, defs, name)] : [];
    case "object":
      return sampleObject(s, defs);
    default:
      return sampleString(s.format, name);
  }
}

function sampleObject(s: Schema, defs: Record<string, Schema>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(s.properties ?? {}).map(([k, p]) => [k, sampleValue(p, defs, k)]),
  );
}

/** A ready-to-send JSON body for a request: the schema's own example if given, else sampled per field. */
function requestBodyExample(
  schema: Schema | undefined,
  defs: Record<string, Schema>,
): string | undefined {
  if (!schema) return undefined;
  const s = deref(schema, defs);
  if (s.example !== undefined) return JSON.stringify(s.example, null, 2);
  if (!s.properties) return undefined;
  return JSON.stringify(sampleObject(s, defs), null, 2);
}

/** Read a Company's OpenAPI descriptions into a flat list of callable operations. */
async function readOperations(fetch: typeof globalThis.fetch, c: Company): Promise<Operation[]> {
  const ops: Operation[] = [];
  for (const api of c.apis) {
    if (api.type !== "openapi") continue;
    try {
      const spec = (await (await fetch(api.url)).json()) as {
        servers?: { url: string }[];
        components?: { schemas?: Record<string, Schema> };
        paths?: Record<
          string,
          Record<
            string,
            {
              summary?: string;
              security?: Record<string, string[]>[];
              requestBody?: { content?: Record<string, { schema?: Schema }> };
            }
          >
        >;
      };
      const base = (spec.servers?.[0]?.url ?? `https://${c.domain}`).replace(/\/$/, "");
      for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of ["get", "post", "put", "patch", "delete"]) {
          const op = item[method];
          if (!op) continue;
          const scopes = [...new Set((op.security ?? []).flatMap((r) => Object.values(r).flat()))];
          const bodyExample = requestBodyExample(
            op.requestBody?.content?.["application/json"]?.schema,
            spec.components?.schemas ?? {},
          );
          ops.push({
            method: method.toUpperCase(),
            path,
            url: `${base}${path}`,
            summary: op.summary,
            scopes,
            ...(bodyExample ? { bodyExample } : {}),
          });
        }
      }
    } catch {
      /* skip an API whose spec can't be read */
    }
  }
  return ops;
}

/** This browser's own User id, minted once and kept in its cookie (distinct per browser, spec 5.1). */
const userId = (session: SessionData) => (session.userId ??= crypto.randomUUID());

async function signedInState(agent: PoppyAgent, company: Company, localUserId: string) {
  const user = await agent.user(company, localUserId);
  return { signedIn: user.signedIn, granted: user.scope };
}

// ── Flows: each takes the per-request agent/session/wire and returns plain JSON ──────────────────

/** Discover a Company (shown on the wire), with its callable operations and this session's sign-in. */
export async function discoverFlow(
  agent: PoppyAgent,
  session: SessionData,
  wire: Wire,
  website: string,
) {
  const company = await agent.discover(website);
  companyCache.set(website, { company, at: Date.now() });
  if (session.company && session.company !== company.identifier)
    for (const k of Object.keys(session.store)) delete session.store[k];
  session.company = company.identifier;
  const operations = await readOperations(wire.fetch(), company);
  return {
    company: view(company),
    operations,
    ...(await signedInState(agent, company, userId(session))),
  };
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
export async function callFlow(
  agent: PoppyAgent,
  session: SessionData,
  input: { website: string; url: string; method?: string; body?: string; signedOut?: boolean },
) {
  const company = await cachedCompany(input.website);
  const user = await agent.user(company, userId(session));
  const res = await user.session().fetch(input.url, {
    method: input.method ?? "GET",
    ...(input.signedOut ? { signedOut: true } : {}),
    ...(input.body ? { headers: { "content-type": "application/json" }, body: input.body } : {}),
  });
  const state = { signedIn: user.signedIn, granted: user.scope };
  const needed = scopesNeeded(res);
  if (needed !== undefined) {
    await res.body?.cancel();
    return { needsSignIn: true as const, scope: needed.split(" ").filter(Boolean), ...state };
  }
  return { needsSignIn: false as const, ...(await readResponse(res)), ...state };
}

/** Start Direct Sign-In. Records the Company on the session so the callback (any instance) can finish it. */
export async function signInFlow(
  agent: PoppyAgent,
  session: SessionData,
  website: string,
  redirectUri: string,
  scope?: string[],
) {
  const company = await cachedCompany(website);
  const user = await agent.user(company, userId(session));
  const scopes = scope?.length ? scope : Object.keys(company.scopes);
  const { url } = await user.startDirectSignIn({ scope: scopes, redirectUri });
  session.pendingWebsite = website;
  return { url };
}

/** Finish Direct Sign-In from the callback URL (spec 4.2), using the Company recorded at sign-in start. */
export async function completeFlow(agent: PoppyAgent, session: SessionData, callbackUrl: string) {
  const website = session.pendingWebsite;
  if (!website) throw new Error("No sign-in in progress");
  const company = await cachedCompany(website);
  await agent.completeDirectSignIn(company, callbackUrl);
  delete session.pendingWebsite;
}
