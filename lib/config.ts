// Agent + Company config, all from the environment so the app is deployment-agnostic
// (local .env.local for dev, Vercel env vars in prod). See .env.example.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

/** Company website host, e.g. `stays.127.0.0.1.nip.io`. Discovery starts at its `/.well-known/poppy.json`. */
export const COMPANY_WEBSITE = required("POPPY_COMPANY");

/** This app's public origin, used to self-host the CIMD doc. From POPPY_PUBLIC_URL or Vercel. */
export const PUBLIC_URL =
  process.env.POPPY_PUBLIC_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

/**
 * The agent's CIMD identity. By default the app self-hosts it at `${PUBLIC_URL}/client-metadata.json`.
 * Bring your own by setting POPPY_CLIENT_ID to an existing CIMD URL (e.g. one from makeclient.dev).
 */
export const BYO_CLIENT_ID = process.env.POPPY_CLIENT_ID;
export const SELF_HOSTED = !BYO_CLIENT_ID;
export const CLIENT_ID = BYO_CLIENT_ID ?? (PUBLIC_URL ? `${PUBLIC_URL}/client-metadata.json` : "");

/** Optional fixed redirect URI; when unset it is derived per request as `{origin}/callback`. Must be a
 *  registered redirect_uri on the CIMD doc. */
export const REDIRECT_URI = process.env.POPPY_REDIRECT_URI;

export const LOCAL_USER_ID = process.env.POPPY_USER_ID ?? "demo-user";

/** Allow loopback/private Company hosts (local dev only). Off unless explicitly enabled. */
export const ALLOW_PRIVATE = process.env.POPPY_ALLOW_PRIVATE === "true";

/**
 * Opt out of DPoP by hiding the issuer's DPoP support from the SDK, so it requests plain Bearer tokens.
 * Needed for a Company whose resource server validates Bearer but not DPoP-bound tokens.
 */
export const DISABLE_DPOP = process.env.POPPY_DISABLE_DPOP === "true";
