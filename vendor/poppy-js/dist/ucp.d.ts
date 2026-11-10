import type { Company } from "./discovery.ts";
import { PoppyError } from "./errors.ts";
import { type Fetch } from "./http.ts";
import { type Signer } from "./jose.ts";
import type { Session } from "./session.ts";
/**
 * Universal Commerce Protocol (UCP) support for the agent side, which UCP calls the platform. A Company
 * that lists Poppy's UCP extension, version 1, speaks UCP at the endpoints its profile names: Poppy finds
 * it, identifies the agent and User, and signs the User in, and UCP is how the agent shops. Requests then
 * carry the Session header, and an access token when signed in. Without the extension, UCP works on its
 * own, with no Poppy Session or tokens. Follows UCP 2026-08-25.
 */
export declare const UCP_VERSION = "2026-08-25";
/** One transport of a UCP service, such as REST or MCP. */
export interface UcpServiceBinding {
    version: string;
    transport: "rest" | "mcp" | "a2a" | "embedded" | (string & {});
    endpoint: string | undefined;
    spec: string | undefined;
    schema: string | undefined;
}
/** One version of a capability, such as `dev.ucp.shopping.checkout`. */
export interface UcpCapability {
    version: string;
    spec?: string;
    schema?: string;
    /** Parent capabilities this one extends. */
    extends?: string | string[];
    config?: Record<string, unknown>;
}
/** A business's UCP profile, from `/.well-known/ucp`, after checks. */
export interface UcpBusiness {
    /** The URL the profile was fetched from. */
    url: string;
    version: string;
    /** Older versions the business supports, mapped to their profile URLs. */
    supportedVersions: Readonly<Record<string, string>>;
    services: Readonly<Record<string, readonly UcpServiceBinding[]>>;
    capabilities: Readonly<Record<string, readonly UcpCapability[]>>;
    paymentHandlers: Readonly<Record<string, readonly unknown[]>>;
    /** The business's signing keys, for verifying its webhooks and signed responses. */
    keys: readonly JsonWebKey[];
}
/** The agent's own UCP profile, which it publishes at the URL it sends in `UCP-Agent`. */
export interface UcpPlatformInput {
    /** Defaults to {@link UCP_VERSION}. */
    version?: string;
    capabilities: Readonly<Record<string, readonly UcpCapability[]>>;
    /** Public signing keys, each with a `kid`. Every UCP business verifies ES256. */
    keys: readonly (JsonWebKey & {
        kid?: string;
    })[];
    services?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
    paymentHandlers?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}
/** Builds the platform profile to serve, with HTTPS and `Cache-Control: public, max-age=60` or more. */
export declare function ucpPlatformProfile(input: UcpPlatformInput): Record<string, unknown>;
/**
 * The authority a capability name speaks for: its first two labels, reversed, so
 * `dev.ucp.shopping.checkout` is `ucp.dev` (UCP overview, Authority Binding).
 * ponytail: covers two-label authorities; names under a multi-label suffix need the full algorithm.
 */
export declare function ucpAuthority(capability: string): string;
/** Parses a UCP profile document. Capabilities whose schema isn't on their namespace's authority are dropped. */
export declare function parseUcpProfile(body: unknown, url: string): UcpBusiness;
export interface UcpDiscoverOptions {
    fetch?: Fetch;
    allowPrivateAddresses?: boolean;
}
/**
 * Fetches a business's UCP profile from `https://{domain}/.well-known/ucp`. UCP profiles are never served
 * through a redirect, and special-use addresses are refused.
 */
export declare function discoverUcp(website: string, options?: UcpDiscoverOptions): Promise<UcpBusiness>;
/**
 * Fetches the UCP profile of a Company that lists the UCP extension, from `https://{domain}/.well-known/ucp`
 * on its validated domain, without following redirects (UCP extension 3).
 */
export declare function discoverCompanyUcp(company: Company, options?: UcpDiscoverOptions): Promise<UcpBusiness>;
/** The result of negotiating with a business (UCP overview, Negotiation). */
export interface UcpNegotiation {
    business: UcpBusiness;
    version: string;
    /** The shared capabilities, each at the highest version both sides support. */
    capabilities: Readonly<Record<string, UcpCapability>>;
    /** The REST endpoint of the service, if the business offers REST. */
    restEndpoint: string | undefined;
    /** The MCP endpoint of the service, if the business offers MCP. */
    mcpEndpoint: string | undefined;
}
/**
 * Computes the capabilities both sides support: by name, then the highest shared version, then
 * extensions whose parents survived, repeated until nothing more is dropped (UCP overview, Intersection).
 */
export declare function intersectCapabilities(business: Readonly<Record<string, readonly UcpCapability[]>>, platform: Readonly<Record<string, readonly UcpCapability[]>>): Record<string, UcpCapability>;
/**
 * Picks the newest protocol version both sides support, fetching the business's profile for an older
 * version if needed, and intersects capabilities. Rejects with `version_unsupported` when there is none.
 */
export declare function negotiateUcp(business: UcpBusiness, platform: {
    version?: string;
    capabilities: Readonly<Record<string, readonly UcpCapability[]>>;
}, options?: UcpDiscoverOptions & {
    service?: string;
}): Promise<UcpNegotiation>;
/**
 * The OAuth scopes to request for UCP Identity Linking: the business's `config.scopes` for the
 * identity-linking capability, kept to those of capabilities both sides support (`{capability}:{scope}`).
 */
export declare function ucpIdentityScopes(negotiation: UcpNegotiation): string[];
/** A UCP error: the `messages` of an error response, or a transport error's `code` (UCP overview). */
export declare class UcpError extends PoppyError {
    readonly name = "UcpError";
    readonly messages: readonly {
        type?: string;
        code?: string;
        content?: string;
        severity?: string;
        path?: string;
    }[];
    /** Where to hand the buyer over to finish in the business's own interface. */
    readonly continueUrl: string | undefined;
    constructor(code: string, options: {
        status: number;
        messages?: UcpError["messages"];
        continueUrl?: string | undefined;
        description?: string | undefined;
        retryAfter?: number | undefined;
    });
}
export interface UcpClientOptions {
    negotiation: UcpNegotiation;
    /** The URL of your platform profile, sent in `UCP-Agent` on every request. */
    profileUrl: string;
    /** Signs requests with RFC 9421 (UCP Signatures). ES256 is the algorithm every business verifies. */
    signer?: Signer;
    /**
     * A Poppy Session at a Company that lists the UCP extension, whose profile `negotiation` came from.
     * Requests then go through `session.fetch`, so they carry the Session header and, when signed in, the
     * access token (UCP extension 4). Leave it out to use UCP on its own.
     */
    session?: Session;
    /** For requests that don't go through a Session. Defaults to the global `fetch`. */
    fetch?: Fetch;
    allowPrivateAddresses?: boolean;
}
export interface UcpRequestOptions {
    /** Reuse the key to retry the same request, such as Complete Checkout. A new one is made otherwise. */
    idempotencyKey?: string;
    query?: Record<string, string>;
    /** Through a Session, sends no access token. */
    signedOut?: boolean;
}
/**
 * A UCP REST client for one business. Every request carries `UCP-Agent` and `Request-Id`, mutating ones
 * an `Idempotency-Key`, and bodies a `Content-Digest`. With a signer, it signs `@method`, `@authority`,
 * `@path`, `@query`, `ucp-agent`, `idempotency-key`, `content-digest` and `content-type`.
 */
export declare class UcpClient {
    #private;
    readonly negotiation: UcpNegotiation;
    constructor(options: UcpClientOptions);
    /** Sends one UCP REST request and returns its JSON body, throwing {@link UcpError} on an error. */
    request(method: string, path: string, body?: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    createCheckout(checkout: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    getCheckout(id: string): Promise<Record<string, unknown>>;
    updateCheckout(id: string, checkout: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    /**
     * Places the order. Retry only with the same `idempotencyKey`, and poll with {@link getCheckout}, never
     * with Complete again. Ask the User before calling it.
     */
    completeCheckout(id: string, body: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    cancelCheckout(id: string, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    createCart(cart: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    getCart(id: string): Promise<Record<string, unknown>>;
    updateCart(id: string, cart: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    searchCatalog(query: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    lookupCatalog(query: Record<string, unknown>, options?: UcpRequestOptions): Promise<Record<string, unknown>>;
    getOrder(id: string): Promise<Record<string, unknown>>;
}
/** Reads a UCP response, throwing {@link UcpError} for transport errors and `ucp.status: "error"`. */
export declare function parseUcpResponse(response: Response): Promise<Record<string, unknown>>;
/**
 * Where to hand the buyer over when a checkout needs them (`requires_escalation`), which the platform
 * must use (UCP checkout). Undefined otherwise.
 */
export declare function ucpHandoffUrl(checkout: Record<string, unknown>): string | undefined;
/**
 * The `meta` a UCP MCP tool call carries in its arguments (UCP MCP binding): the agent profile, and an
 * idempotency key for `complete_checkout` and `cancel_checkout`.
 */
export declare function ucpMcpArguments(profileUrl: string, args: Record<string, unknown>, options?: {
    idempotencyKey?: string;
}): Record<string, unknown>;
