import type { Company, OAuthServer } from "./discovery.ts";
import { DpopKey } from "./dpop.ts";
import { type Fetch } from "./http.ts";
import { type Signer } from "./jose.ts";
export interface OAuthContext {
    clientId: string;
    signer: Signer;
    fetch: Fetch;
    company: Company;
    oauth: OAuthServer;
}
export declare function requireOAuth(company: Company): OAuthServer;
/**
 * A client assertion (RFC 7523 section 3, spec 4.1): short-lived, with a unique `jti`, and `aud` set to the
 * Company's issuer as a single string, never an endpoint (spec 10.4).
 */
export declare function clientAuth(context: OAuthContext): Promise<Record<string, string>>;
export interface TokenResponse {
    accessToken: string;
    /** `Bearer` or `DPoP` (spec 4.5). */
    tokenType: "Bearer" | "DPoP";
    /** Seconds, or undefined when the Company didn't say. */
    expiresIn: number | undefined;
    refreshToken: string | undefined;
    /** The granted scopes. */
    scope: string[];
}
export declare function splitScope(scope: string | readonly string[]): string[];
/**
 * Parses a token response (spec 4.7). `scope` is left out only when the Company granted exactly what was
 * requested. A sign-in grants at least one scope, and never more than requested.
 */
export declare function parseTokenResponse(body: unknown, requested: readonly string[]): TokenResponse;
/** Whether the issuer lists ES256 for DPoP, so token requests carry a proof (spec 4.5). */
export declare function issuerUsesDpop(oauth: OAuthServer): boolean;
/** Sends a token request with a fresh client assertion, retrying once on a DPoP nonce challenge. */
export declare function tokenRequest(context: OAuthContext, params: Record<string, string>, dpop: {
    key: DpopKey;
    nonces: Map<string, string>;
} | undefined): Promise<unknown>;
/** Revokes a refresh token (RFC 7009, spec 4.6). */
export declare function revokeRefreshToken(context: OAuthContext, token: string): Promise<void>;
/**
 * Checks a link the User will open for Device Sign-In (spec 4.3): its host must be the issuer's host or
 * the host of a URL in `protected_resources`, or a subdomain of either.
 */
export declare function checkSignInUrl(oauth: OAuthServer, value: unknown, what: string): string;
/** PKCE S256 (RFC 7636). */
export declare function pkce(): Promise<{
    verifier: string;
    challenge: string;
}>;
export declare function oauthError(error: unknown, code: string): boolean;
