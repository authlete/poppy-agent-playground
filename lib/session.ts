// Per-browser session, held entirely in an encrypted cookie — the server keeps nothing. Each request
// decrypts the cookie into the SDK's Store (refresh token, DPoP key, pending sign-in), runs the action,
// and writes the updated cookie back. This makes the playground stateless, so it survives on any
// serverless instance and isolates every visitor. Tokens are secrets (spec 10.2), hence the encryption.
import type { Store } from "@descope/poppy";

const COOKIE = "poppy_session";
const MAX_AGE = 60 * 60 * 24 * 7; // a week

export interface Identity {
  clientId: string;
  jwk: JsonWebKey & { kid: string };
}

export interface SessionData {
  store: Record<string, string>;
  dpop: boolean;
  identity?: Identity;
  pendingWebsite?: string;
  /** Issuer of the Company this session holds state for; switching Companies clears the store so the
   *  cookie stays scoped to one Company (a playground tests one at a time) and never grows unbounded. */
  company?: string;
}

const empty = (): SessionData => ({ store: {}, dpop: true });

/** AES-GCM key derived from a server secret shared by every instance (so cookies decrypt anywhere). */
async function key(): Promise<CryptoKey> {
  const secret =
    process.env.POPPY_SESSION_SECRET ?? process.env.POPPY_AGENT_KEY ?? "poppy-playground-dev";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(data: SessionData): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), pt));
  return Buffer.from([...iv, ...ct]).toString("base64url");
}

async function decrypt(value: string): Promise<SessionData | undefined> {
  try {
    const raw = new Uint8Array(Buffer.from(value, "base64url"));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.subarray(0, 12) },
      await key(),
      raw.subarray(12),
    );
    return JSON.parse(new TextDecoder().decode(pt)) as SessionData;
  } catch {
    return undefined;
  }
}

export async function readSession(req: Request): Promise<SessionData> {
  const match = (req.headers.get("cookie") ?? "").match(new RegExp(`${COOKIE}=([^;]+)`));
  return (match && (await decrypt(match[1]))) || empty();
}

export async function sessionCookie(data: SessionData): Promise<string> {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${COOKIE}=${await encrypt(data)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** A {@link Store} over a plain record, so the whole store serializes into the cookie. */
export class RecordStore implements Store {
  constructor(private data: Record<string, string>) {}
  async get(k: string) {
    return this.data[k];
  }
  async set(k: string, v: string) {
    this.data[k] = v;
  }
  async delete(k: string) {
    delete this.data[k];
  }
}
