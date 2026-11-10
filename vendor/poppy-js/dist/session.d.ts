import type { Account } from "./account.ts";
import { Conversations } from "./conversations.ts";
import type { Company } from "./discovery.ts";
import { PoppyError } from "./errors.ts";
import { type Fetch } from "./http.ts";
import { type Approval } from "./operations.ts";
import { type OperatorSignatureOptions } from "./operator.ts";
import type { ResourceResolver } from "./resources.ts";
import { type DelegatedKeys } from "./session-jwt.ts";
import { type SkillArtifact } from "./skills.ts";
import { type Alternative, type ExcludedTask, type FeedbackReport } from "./tasks.ts";
type FetchBody = Exclude<RequestInit["body"], ReadableStream | null | undefined>;
export type SessionFetchInit = Omit<RequestInit, "body" | "redirect"> & {
    body?: FetchBody;
    /** Sends no access token, even when the User is signed in (spec 5). */
    signedOut?: boolean;
    /** Asks for an access token with fewer scopes than the refresh token has (spec 4.4). */
    scope?: string | readonly string[];
    /** The User's approval of an operation, sent in `Poppy-Approval` (Operations extension section 6). */
    approval?: Approval;
};
export interface SessionInit {
    company: Company;
    clientId: string;
    userId: string;
    agentId: string | undefined;
    keys: DelegatedKeys;
    account: Account | undefined;
    resolver: ResourceResolver;
    fetch: Fetch;
    operator: OperatorSignatureOptions | undefined;
    allowPrivateAddresses: boolean;
}
/**
 * Drives the agent's own browser through a browser join (spec 6). Never use the User's own browser.
 */
export interface BrowserJoiner {
    /** Loads the URL in the agent's browser as a top-level navigation. */
    open(url: string): Promise<void>;
    /** Reads the hidden `code` field from the page the browser just loaded, in code the model can't read. */
    readCode(): Promise<string>;
    /** Submits the page's form. */
    submit(): Promise<void>;
}
/**
 * One User's activity at one Company through this agent (spec 5). Get one from {@link PoppyUser.session}.
 * Each request carries a fresh Session JWT, and an access token when the User is signed in.
 */
export declare class Session {
    #private;
    readonly company: Company;
    readonly userId: string;
    readonly agentId: string | undefined;
    constructor(init: SessionInit);
    /** The Session ID (`sid`). Not a credential, but don't use it for anything else (spec 5.2). */
    get id(): string;
    /** Whether requests carry an access token by default. */
    get signedIn(): boolean;
    get ended(): boolean;
    /** Stops using this Session's `sid` (spec 5.5). The account stays signed in. */
    end(): void;
    /**
     * Sends a request to the Company with the Session header, plus an access token when signed in (spec 5.2,
     * 4.5). The URL must be a destination for the Session header: a request URL of an API `poppy.json`
     * lists, or a protocol or extension endpoint. Redirects are returned, never followed, so no secret
     * reaches another URL (spec 3).
     *
     * Retries once in a new Session on `session_ended` (spec 5.5), once on a DPoP nonce challenge, and once
     * after refreshing on `invalid_token`. `invalid_session` is returned, since a new Session doesn't fix it
     * (spec 5.3). Other errors are returned; see {@link authChallenge}.
     */
    fetch(input: string | URL, init?: SessionFetchInit): Promise<Response>;
    /**
     * Adds an endpoint an extension defines that `poppy.json` doesn't list, such as a UCP service the
     * Company's profile names (UCP extension 2), so requests under it carry the Session header.
     */
    addExtensionEndpoint(endpoint: string): void;
    /** Talks with the Company Agent (spec section 8), through its `poppy` conversation endpoint. */
    conversations(endpoint?: string): Conversations;
    /**
     * Step 2 of a browser join (spec 6): authorizes a code read from the page the agent's own browser loaded.
     * Signed in unless `signedOut`, so the website acts with the account and the access token's scopes.
     */
    authorizeBrowserCode(code: string, options?: {
        signedOut?: boolean;
    }): Promise<void>;
    /**
     * Joins the agent's own browser to this Session (spec 6): loads the browser-session page, authorizes its
     * code, and submits the form, right away so the code doesn't expire. Join again after signing in or out.
     */
    joinBrowser(browser: BrowserJoiner, options?: {
        signedOut?: boolean;
    }): Promise<void>;
    /**
     * Fetches a skill from the Company's `skill_index` and checks its digest (spec 9.4), with no Session
     * header or token. See {@link fetchSkill}.
     */
    fetchSkill(name: string): Promise<SkillArtifact>;
    /**
     * Reads the tasks the Company chose not to offer (spec 9.1), with a plain GET and no token. Returns an
     * empty list when the Company publishes none.
     */
    excludedTasks(): Promise<ExcludedTask[]>;
    /**
     * Reports a task the User couldn't do (spec 9.3), with the Session header and no access token. Resolves
     * with an alternative if the Company says the task can be done after all, else undefined.
     */
    sendFeedback(report: FeedbackReport): Promise<Alternative | undefined>;
}
/**
 * The error for a failed response: from `WWW-Authenticate` for token errors and challenges (spec 7), else
 * from the JSON body (spec 8.13).
 */
export declare function throwable(response: Response): Promise<PoppyError>;
export {};
