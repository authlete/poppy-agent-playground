// Agent configuration from the environment. Everything is optional — a deployed instance needs no
// config: it self-hosts its identity on its own origin and generates a signing key. See .env.example.

/** Optional prefill for the Company field in the UI; the Company is normally typed there. */
export const DEFAULT_COMPANY = process.env.POPPY_DEFAULT_COMPANY ?? "";

/** The public URL where this agent app is reachable — an external AS fetches the self-hosted CIMD
 *  here. Auto-detected on Vercel; set POPPY_AGENT_URL for local (a tunnel). Must be public. */
export const AGENT_URL =
  process.env.POPPY_AGENT_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

/**
 * The agent's CIMD identity. By default it is self-hosted at `${AGENT_URL}/client-metadata.json`.
 * Set POPPY_CLIENT_ID to bring your own CIMD URL instead.
 */
export const BYO_CLIENT_ID = process.env.POPPY_CLIENT_ID;
export const HOSTS_OWN_CIMD = !BYO_CLIENT_ID;
export const CLIENT_ID = BYO_CLIENT_ID ?? (AGENT_URL ? `${AGENT_URL}/client-metadata.json` : "");

/** Optional fixed Direct Sign-In redirect; defaults per request to `{origin}/callback`. */
export const REDIRECT_URI = process.env.POPPY_REDIRECT_URI;

export const LOCAL_USER_ID = process.env.POPPY_USER_ID ?? "demo-user";

/** Allow loopback/private Company hosts (local dev only). Off by default. */
export const ALLOW_PRIVATE = process.env.POPPY_ALLOW_PRIVATE === "true";
