import { clientMetadata } from "@descope/poppy";
import { CLIENT_ID, AGENT_URL, REDIRECT_URI, HOSTS_OWN_CIMD } from "@/lib/config";

// The self-hosted CIMD document. The Company's AS fetches this to learn our keys and redirect URIs.
export function GET() {
  if (!HOSTS_OWN_CIMD || !AGENT_URL) return Response.json({ error: "not_found" }, { status: 404 });
  const redirectUris = [...new Set([`${AGENT_URL}/callback`, REDIRECT_URI].filter(Boolean))] as string[];
  const doc = clientMetadata({
    clientId: CLIENT_ID,
    clientName: "Poppy Agent Playground",
    jwksUri: `${AGENT_URL}/jwks.json`,
    redirectUris,
  });
  // clientMetadata() omits these; Authlete needs the signing alg for private_key_jwt (A157306) and
  // refresh_token in grant_types to issue a refresh token (the SDK requires one on sign-in).
  return Response.json({
    ...doc,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_signing_alg: "ES256",
  });
}
