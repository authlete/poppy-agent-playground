/**
 * The wire log: a process-wide record of every HTTP call the Poppy SDK makes, so the UI can show the
 * Poppy/OAuth handshake byte by byte. We decode the interesting JWTs (the Poppy-Session and its nested
 * delegation, and the private_key_jwt client assertion) for display — this is a local demo, so showing
 * them is the whole point.
 */

import type { DecodedJwt, WireEntry } from "./types";

interface WireStore {
  entries: WireEntry[];
  seq: number;
}

// Survive Next.js HMR / route-module isolation by hanging the store off globalThis.
const store: WireStore = ((globalThis as Record<string, unknown>).__poppyWire as WireStore) ?? {
  entries: [],
  seq: 0,
};
(globalThis as Record<string, unknown>).__poppyWire = store;

export function wireEntries(): WireEntry[] {
  return store.entries;
}

export function clearWire(): void {
  store.entries = [];
}

function decodeJwt(token: string): DecodedJwt | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    return { header, claims };
  } catch {
    return undefined;
  }
}

const SHORTEN = new Set(["code", "refresh_token", "code_verifier", "client_assertion"]);

function readBody(init: RequestInit | undefined): Record<string, string> | undefined {
  const body = init?.body;
  if (typeof body !== "string" && !(body instanceof URLSearchParams)) return undefined;
  const params = new URLSearchParams(typeof body === "string" ? body : body.toString());
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = SHORTEN.has(k) && v.length > 24 ? `${v.slice(0, 16)}…` : v;
  return Object.keys(out).length > 0 ? out : undefined;
}

const SHOW_HEADERS = new Set([
  "poppy-session",
  "poppy-version",
  "authorization",
  "dpop",
  "content-type",
  "accept",
]);

/** Build the request half of a log entry: method, URL, shown headers, body, and decoded JWTs. */
function describeRequest(input: RequestInfo | URL, init: RequestInit | undefined): WireEntry {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

  const reqHeaders: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (!SHOW_HEADERS.has(name.toLowerCase())) continue;
    reqHeaders[name] = name.toLowerCase() === "authorization" ? `${value.slice(0, 14)}…` : value;
  }

  const reqBody = readBody(init);
  const entry: WireEntry = {
    id: crypto.randomUUID(),
    seq: ++store.seq,
    startedAt: Date.now(),
    method,
    url,
    reqHeaders,
    ...(reqBody ? { reqBody } : {}),
  };

  const session = decodeJwt(headers.get("poppy-session") ?? "");
  if (session) {
    entry.poppySession = session;
    if (typeof session.header["poppy_dlg"] === "string")
      entry.delegation = decodeJwt(session.header["poppy_dlg"]);
  }
  if (typeof init?.body === "string") {
    const assertion = new URLSearchParams(init.body).get("client_assertion");
    if (assertion) entry.clientAssertion = decodeJwt(assertion);
  }
  return entry;
}

/**
 * Wraps a `fetch` so every call is logged. Pass the result as the SDK's `fetch` option; the SDK then
 * drives the Company and AS through here, and the UI reads {@link wireEntries}.
 */
export function instrumentedFetch(base: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const entry = describeRequest(input, init);
    store.entries.push(entry);
    const startedAt = performance.now();
    try {
      const res = await base(input, init);
      entry.status = res.status;
      entry.ok = res.ok;
      entry.durationMs = Math.round(performance.now() - startedAt);
      void res
        .clone()
        .text()
        .then((text) => (entry.respPreview = text.slice(0, 2000)))
        .catch(() => undefined);
      return res;
    } catch (err) {
      entry.durationMs = Math.round(performance.now() - startedAt);
      entry.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }) as typeof fetch;
}
