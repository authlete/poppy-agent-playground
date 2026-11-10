/**
 * A strict Company for testing Personal Agents. It serves draft 0.3 discovery, an OAuth issuer, an
 * OpenAPI API, an MCP server and conversations, as a `fetch` the agent under test sends everything
 * through. It verifies every request against the rules the spec sets for Personal Agents, and records
 * which checks passed and which failed.
 */
export declare const ORIGIN = "https://shop.test";
export declare const ISSUER = "https://shop.test";
export declare const API = "https://shop.test/api";
export declare const MCP = "https://mcp.shop.test/mcp";
export declare const CONVERSATIONS = "https://shop.test/poppy/conversations";
/** Behaviors a scenario switches on, to see how the agent reacts. */
export interface Scenario {
    /** www.shop.test redirects poppy.json to an uploaded file. */
    redirectToUpload?: boolean;
    /** organization.domain names another host. */
    wrongDomain?: boolean;
    /** poppy.json declares a protocol version this draft doesn't define. */
    futureVersion?: boolean;
    /** The issuer's protected_resources leaves out the domain. */
    issuerUnlinked?: boolean;
    /** The domain's protected resource metadata fails with HTTP 500. */
    resourceMetadataFails?: boolean;
    /** poppy.json lists an API on a loopback address. */
    privateApi?: boolean;
    /** The API answers session_ended to the first request of each Session, or to every request. */
    sessionEnded?: "once" | "always";
    /** The API answers invalid_session to every request. */
    invalidSession?: boolean;
    /** Every refresh returns a new refresh token. */
    rotate?: boolean;
    /** Sign-in grants a scope the agent didn't ask for. */
    extraScope?: boolean;
    /** The issuer advertises DPoP and binds tokens to the proof's key. */
    dpop?: boolean;
    /** Access tokens are rejected once, with invalid_token, to make the agent refresh. */
    expireTokensOnce?: boolean;
    /** The authorization response names another issuer in iss. */
    wrongIss?: boolean;
}
interface Recorded {
    method: string;
    url: URL;
    headers: Headers;
    body: string;
}
export declare class ConformanceCompany {
    #private;
    readonly scenario: Scenario;
    readonly requests: Recorded[];
    constructor(scenario?: Scenario, options?: {
        agentFetch?: typeof fetch;
    });
    pass(id: string): void;
    fail(id: string, message: string): void;
    /** Withdraws a check, such as one that tested something other than the agent. */
    skip(id: string): void;
    /** Checks this Company exercised, with the failures found for each. */
    results(): Map<string, string[]>;
    /** Requests whose URL is outside the Company, such as a redirect target or a private address. */
    /** How many requests reached an API, MCP server or conversation endpoint. */
    resourceRequests(): number;
    /** How many times the agent's "browser" opened the authorization endpoint. */
    authorizeRequests(): number;
    offsite(): Recorded[];
    readonly fetch: typeof fetch;
    poppyJson(): Record<string, unknown>;
    /** Called by the runner after a session_ended or invalid_session scenario (spec 5.3, 5.5). */
    checkSessionErrors(requestsTo: string): void;
}
export {};
