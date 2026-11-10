import { type Company } from "./discovery.ts";
import { DpopKey } from "./dpop.ts";
import { type Fetch } from "./http.ts";
import { type Signer } from "./jose.ts";
import { type TokenResponse } from "./oauth.ts";
import type { ResourceChoice } from "./resources.ts";
import type { Store } from "./store.ts";
/** An access token, held in memory only (spec 10.2). */
export interface AccessToken {
    value: string;
    type: "Bearer" | "DPoP";
    expiresAt: number;
    scope: readonly string[];
}
export interface PendingDirectSignIn {
    identifier: string;
    issuer: string;
    localUserId: string;
    account: string;
    agent: string | undefined;
    verifier: string;
    redirectUri: string;
    scope: string[];
    expiresAt: number;
}
export interface AccountInit {
    clientId: string;
    signer: Signer;
    fetch: Fetch;
    store: Store;
    storeKey: string;
    company: Company;
}
export declare const PENDING_PREFIX = "poppy:0.3:direct:";
export declare const PENDING_LIFETIME: number;
/**
 * One account at one Company (spec 4): its refresh token, persisted in the store, and its access tokens,
 * kept in memory per `resource`. Token writes run one at a time, so a rotated refresh token is never lost.
 */
export declare class Account {
    #private;
    constructor(init: AccountInit);
    load(): Promise<void>;
    get signedIn(): boolean;
    /** Scopes of the refresh token. Empty when signed out. */
    get scope(): string[];
    /** The DPoP key and nonces for a resource request with a DPoP-bound token. */
    dpopForRequest(): Promise<{
        key: DpopKey;
        nonces: Map<string, string>;
    }>;
    /**
     * An access token for a request, or undefined when signed out (spec 4.5). Gets one with the refresh token
     * when needed, for the service's own `resource` if it has one.
     */
    accessToken(choice: ResourceChoice): Promise<AccessToken | undefined>;
    /** Drops a token a resource rejected with `invalid_token`, so the next request gets a new one. */
    invalidate(choice: ResourceChoice): void;
    /** Gets an access token with fewer scopes than the refresh token, such as read-only for a lookup. */
    narrowedToken(choice: ResourceChoice, scope: string | readonly string[]): Promise<AccessToken | undefined>;
    /** Starts Direct Sign-In (spec 4.2): returns the URL to open in the User's browser. */
    startDirect(options: {
        scope: string | readonly string[];
        redirectUri: string;
        replaceScopes?: boolean;
    }, pending: Omit<PendingDirectSignIn, "verifier" | "redirectUri" | "scope" | "expiresAt" | "issuer" | "identifier">): Promise<{
        url: string;
        state: string;
    }>;
    /**
     * Finishes Direct Sign-In from the redirect back (spec 4.2). Checks `iss` against the issuer sign-in
     * started with (RFC 9207), including on errors, then exchanges the code.
     */
    completeDirect(record: PendingDirectSignIn, params: URLSearchParams): Promise<string[]>;
    /** Starts Device Sign-In (spec 4.3). */
    startDevice(options: {
        scope: string | readonly string[];
        replaceScopes?: boolean;
    }): Promise<DeviceSignIn>;
    /**
     * Mediated Sign-In (extension, transitional). Sends the credentials only to the issuer's token endpoint
     * with the extension's grant, and never keeps them.
     */
    mediated(options: {
        scope: string | readonly string[];
        credentials: Readonly<Record<string, string>>;
    }): Promise<MediatedSignInResult>;
    /** Signs out (spec 5.5): revokes the refresh token. Sessions continue signed out. */
    signOut(): Promise<void>;
    /** Signs out, then deletes the stored state. Further use of this account fails. */
    forget(): Promise<void>;
}
/** The result of a Mediated Sign-In step. */
export type MediatedSignInResult = {
    status: "signed_in";
    scope: string[];
} | {
    status: "code_required";
    /** Show the Company's name and domain whenever you ask the User for a code. */
    organizationName: string;
    domain: string;
    /** Where the Company sent the code, such as "Text to the phone number ending in 71". */
    sentTo: string | undefined;
    expiresIn: number | undefined;
    /** Sends the one-time code the User gives you. */
    submitCode(code: string): Promise<MediatedSignInResult>;
};
/** What to show the User for a pending {@link DeviceSignIn} (RFC 8628 section 3.2, spec 4.3). */
export interface DeviceSignInDetails {
    /** Show the Company's name and domain with the link (spec 4.3). */
    organizationName: string;
    domain: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string | undefined;
    /** Seconds until the request expires. */
    expiresIn: number;
    /** Seconds between polls. */
    interval: number;
}
/** A pending Device Sign-In. The device code stays private to this object (spec 10.2). */
export declare class DeviceSignIn implements Readonly<DeviceSignInDetails> {
    #private;
    readonly organizationName: string;
    readonly domain: string;
    readonly userCode: string;
    readonly verificationUri: string;
    readonly verificationUriComplete: string | undefined;
    readonly expiresIn: number;
    constructor(details: DeviceSignInDetails, deviceCode: string, poll: (deviceCode: string) => Promise<TokenResponse>, complete: (token: TokenResponse) => Promise<string[]>);
    get interval(): number;
    /**
     * Polls until the User finishes, then stores the tokens. Resolves with the granted scopes, which may be
     * fewer than requested (spec 4.7). Rejects with `access_denied` or `expired_token`, or the signal's reason.
     */
    wait(options?: {
        signal?: AbortSignal;
    }): Promise<{
        scope: string[];
    }>;
}
