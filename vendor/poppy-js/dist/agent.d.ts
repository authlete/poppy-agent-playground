import { Account, type DeviceSignIn, type MediatedSignInResult } from "./account.ts";
import { type Company } from "./discovery.ts";
import { type Fetch } from "./http.ts";
import { type Signer, type SigningKey } from "./jose.ts";
import type { OperatorSignatureOptions } from "./operator.ts";
import { ResourceResolver } from "./resources.ts";
import { Session } from "./session.ts";
import { DelegatedKeys } from "./session-jwt.ts";
import { type Store } from "./store.ts";
export interface PoppyAgentOptions {
    /** HTTPS URL of the client metadata document, exactly as published (spec 4.1). */
    clientId: string;
    /** A key from your `jwks_uri`. Give this or `signer`. */
    signingKey?: SigningKey;
    /** Signs with a key from your `jwks_uri` your own way, such as in a KMS or blindly (spec 10.7). */
    signer?: Signer;
    /** Holds User IDs and refresh tokens. Defaults to {@link MemoryStore}. Use encrypted storage in production. */
    store?: Store;
    /** Defaults to the global `fetch`. Every request is sent with `redirect: "manual"`. */
    fetch?: Fetch;
    /** Allow loopback, private and link-local Company hosts, as in tests. Off by default (spec 3). */
    allowPrivateAddresses?: boolean;
    /** The default `redirect_uri` for Direct Sign-In, one of your `redirect_uris` (spec 4.2). */
    redirectUri?: string;
    /**
     * Extensions you list in your client metadata (spec 3.3), such as `{ operations: { version: "2" } }`.
     * Keep it the same as the document, so the Company and this client agree on what you support.
     */
    extensions?: Readonly<Record<string, {
        version: string;
    }>>;
    /** Seconds each delegation lasts, at most 24 hours (spec 5.2). Defaults to one hour. */
    delegationLifetime?: number;
    /** Also sign requests with Web Bot Auth, so bot defenses recognize you (spec 5.3). Recommended. */
    operatorSignature?: OperatorSignatureOptions;
}
export interface UserOptions {
    /**
     * Names one of the User's agents, such as `travel` or `shopping`, so the Company can tell them apart
     * (spec 5.1). The Company sees only an opaque Agent ID. Leave out if you have one agent.
     */
    agent?: string;
    /**
     * Names one of the User's accounts at this Company, such as `personal` or `business`, each with its own
     * refresh token and Sessions (spec 5.4). Defaults to `default`.
     */
    account?: string;
}
/** A Personal Agent. Gives each of its Users a pairwise User ID at each Company, and opens their Sessions. */
export declare class PoppyAgent {
    #private;
    readonly clientId: string;
    readonly extensions: Readonly<Record<string, {
        version: string;
    }>>;
    constructor(options: PoppyAgentOptions);
    /** Like {@link discover}, using this agent's `fetch` and `allowPrivateAddresses`. */
    discover(website: string): Promise<Company>;
    /** Whether this agent lists an extension at a version (spec 3.3). */
    supports(name: string, version: string): boolean;
    /**
     * Returns one of your Users at a Company, with a stable User ID made for that Company alone (spec 5.1).
     * `localUserId` is your own ID for the User. The Company never sees it: it gets a random ID this agent
     * stores, so the ID is opaque, differs at each Company, and isn't derived from personal data.
     */
    user(company: Company, localUserId: string, options?: UserOptions): Promise<PoppyUser>;
    /**
     * A User with a new User ID for one anonymous browsing session, like a private browser window (spec
     * 5.1). Nothing is stored, and it can't sign in. Discard it when the browsing session ends.
     */
    anonymousUser(company: Company): PoppyUser;
    /**
     * Finishes a Direct Sign-In from the URL the User's browser was sent back to (spec 4.2), in any process
     * that shares this agent's store. Resolves with the User and the granted scopes.
     */
    completeDirectSignIn(company: Company, callbackUrl: string | URL): Promise<{
        user: PoppyUser;
        scope: string[];
    }>;
    /**
     * Signs the account out and deletes its stored state. With `userIds`, also deletes the User's User ID
     * and Agent IDs at this Company, so the Company sees a new User next time.
     */
    forget(company: Company, localUserId: string, options?: UserOptions & {
        userIds?: boolean;
    }): Promise<void>;
    /**
     * @internal Keeps an index of pending Direct Sign-Ins, and deletes the records of expired ones, so an
     * abandoned sign-in doesn't leave its PKCE verifier in the store. `expiresAt` undefined removes `state`.
     */
    trackPendingSignIn(state: string, expiresAt: number | undefined): Promise<void>;
    /**
     * @internal Deletes the pending Direct Sign-Ins an account started, so a callback that arrives after
     * sign-out or forget can't sign it back in.
     */
    dropPendingSignIns(identifier: string, localUserId: string, account: string): Promise<void>;
    /** @internal */
    sessionInit(company: Company, userId: string, anonymous?: boolean): {
        keys: DelegatedKeys;
        resolver: ResourceResolver;
        fetch: Fetch;
        operator: OperatorSignatureOptions | undefined;
        allowPrivateAddresses: boolean;
    };
    /** @internal */
    get defaultRedirectUri(): string | undefined;
}
interface PoppyUserInit {
    company: Company;
    localUserId: string | undefined;
    userId: string;
    agentId: string | undefined;
    accountName: string | undefined;
    agentName: string | undefined;
    account: Account | undefined;
}
/** One of your Users at one Company, in one account. Get one from {@link PoppyAgent.user}. */
export declare class PoppyUser {
    #private;
    readonly company: Company;
    /** The pairwise User ID the Company sees (spec 5.1). Keep the mapping confidential. */
    readonly userId: string;
    readonly agentId: string | undefined;
    /** True for {@link PoppyAgent.anonymousUser}, which never sends an access token (spec 5.4). */
    readonly anonymous: boolean;
    constructor(agent: PoppyAgent, init: PoppyUserInit);
    /** Whether this account holds a refresh token (spec 4.4). */
    get signedIn(): boolean;
    /** The scopes of the refresh token. Empty when signed out. */
    get scope(): string[];
    /**
     * Starts a new Session with a fresh random `sid` (spec 5.2). Run several for tasks in parallel. Sessions
     * share this account's sign-in.
     */
    session(): Session;
    /** @internal */
    accountFor(): Account;
    /**
     * Starts Direct Sign-In (spec 4.2): open `url` in the User's browser, then pass the URL their browser is
     * sent back to {@link completeDirectSignIn} or {@link PoppyAgent.completeDirectSignIn}. Requests the
     * scopes already held too, unless `replaceScopes`, since the new refresh token replaces the old (4.7).
     * Only for a User who signs in themselves (spec 5.4).
     */
    startDirectSignIn(options: {
        scope: string | readonly string[];
        redirectUri?: string;
        replaceScopes?: boolean;
    }): Promise<{
        url: string;
        state: string;
    }>;
    /** Finishes Direct Sign-In for this User. See {@link PoppyAgent.completeDirectSignIn}. */
    completeDirectSignIn(callbackUrl: string | URL): Promise<{
        scope: string[];
    }>;
    /**
     * Starts Device Sign-In (spec 4.3). Show the User the Company's name and domain with `verificationUri`
     * and `userCode`, then call {@link DeviceSignIn.wait}. Prefer Direct Sign-In when you can.
     */
    startDeviceSignIn(options: {
        scope: string | readonly string[];
        replaceScopes?: boolean;
    }): Promise<DeviceSignIn>;
    /**
     * Mediated Sign-In (extension, transitional): signs in with credentials the User gave you for this
     * Company, chosen by its issuer. Prefer Direct or Device Sign-In whenever the Company offers them.
     */
    mediatedSignIn(options: {
        scope: string | readonly string[];
        credentials: Readonly<Record<string, string>>;
    }): Promise<MediatedSignInResult>;
    /** Signs out (spec 5.5): revokes the refresh token. Sessions continue signed out. */
    signOut(): Promise<void>;
}
export {};
