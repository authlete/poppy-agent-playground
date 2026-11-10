export type Fetch = typeof fetch;
export declare function httpsUrl(value: unknown, what: string): URL;
/**
 * Loopback, private, shared (100.64/10), link-local and site-local addresses and `localhost` (spec 3).
 * Takes a WHATWG URL hostname, which is already normalized (`0x7f.1` becomes `127.0.0.1`,
 * `::ffff:127.0.0.1` becomes `[::ffff:7f00:1]`).
 * ponytail: checks the name only; a DNS name that resolves to a private address is not caught.
 */
export declare function isPrivateHost(hostname: string): boolean;
/** Refuses a private address unless `allowPrivate` (spec 3). */
export declare function checkPublicHost(url: URL, what: string, allowPrivate: boolean): void;
export interface JsonResult {
    status: number;
    body: unknown;
    /** The URL that answered, after redirects. */
    url: URL;
}
/**
 * GETs a public JSON document with no credentials. Follows up to five redirects, each of which must stay
 * on https and off private addresses (spec 3). Returns 404 as `{ status: 404 }` when `allowNotFound`, and
 * throws on any other error status.
 */
export declare function getJson(fetchFn: Fetch, url: URL, what: string, options?: {
    allowPrivate?: boolean;
    allowNotFound?: boolean;
    followRedirects?: boolean;
}): Promise<JsonResult>;
/** Like {@link getJson}, but returns the body as text, for documents that may be YAML. */
export declare function getText(fetchFn: Fetch, url: URL, what: string, allowPrivate: boolean): Promise<string>;
/** Like {@link getJson}, but returns the body's raw bytes, such as a skill artifact to hash. */
export declare function getBytes(fetchFn: Fetch, url: URL, what: string, allowPrivate: boolean): Promise<Uint8Array>;
/** Never follows redirects, so credentials in the body stay at their endpoint (spec 3). */
export declare function postForm(fetchFn: Fetch, url: string, body: URLSearchParams, headers?: Record<string, string>): Promise<Response>;
export declare function isObject(value: unknown): value is Record<string, unknown>;
export declare function isRedirect(response: Response): boolean;
/** `https://{host}` for a domain, lowercased with no trailing slash (spec 3.2). */
export declare function originOf(domain: string): string;
/**
 * The RFC 9728 section 3.1 metadata URL for a resource: the well-known suffix goes between the host and
 * the path, and a lone `/` path is dropped.
 */
export declare function resourceMetadataUrl(resource: string): URL;
/** RFC 8414 section 3.1: the same rule for an issuer. */
export declare function authorizationServerMetadataUrl(issuer: string): URL;
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
