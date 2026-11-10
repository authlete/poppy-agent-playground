import { PoppyError, PoppyProtocolError, parseRetryAfter } from "./errors.js";
import { checkPublicHost, getJson, httpsUrl, isObject, isRedirect } from "./http.js";
import { randomId } from "./jose.js";
import { addSignature } from "./operator.js";
/**
 * Universal Commerce Protocol (UCP) support for the agent side, which UCP calls the platform. A Company
 * that lists Poppy's UCP extension, version 1, speaks UCP at the endpoints its profile names: Poppy finds
 * it, identifies the agent and User, and signs the User in, and UCP is how the agent shops. Requests then
 * carry the Session header, and an access token when signed in. Without the extension, UCP works on its
 * own, with no Poppy Session or tokens. Follows UCP 2026-08-25.
 */
export const UCP_VERSION = "2026-08-25";
const DATE_VERSION = /^\d{4}-\d{2}-\d{2}$/;
const PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "k"];
/** Builds the platform profile to serve, with HTTPS and `Cache-Control: public, max-age=60` or more. */
export function ucpPlatformProfile(input) {
    const version = input.version ?? UCP_VERSION;
    if (!DATE_VERSION.test(version))
        throw new PoppyProtocolError("UCP versions are YYYY-MM-DD dates");
    for (const key of input.keys) {
        if (typeof key.kid !== "string" || key.kid === "")
            throw new PoppyProtocolError("each UCP signing key needs a kid");
        if (PRIVATE_MEMBERS.some((member) => member in key))
            throw new PoppyProtocolError("UCP keys must be public keys only");
    }
    return {
        ucp: {
            version,
            services: input.services ?? {},
            capabilities: input.capabilities,
            payment_handlers: input.paymentHandlers ?? {},
        },
        keys: input.keys,
    };
}
function record(value, what, parse) {
    if (!isObject(value))
        throw new PoppyProtocolError(`${what} must be an object`);
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, parse(entry, name)]));
}
function list(value, what) {
    if (!Array.isArray(value) || !value.every(isObject))
        throw new PoppyProtocolError(`${what} must be a list of objects`);
    return value;
}
/**
 * The authority a capability name speaks for: its first two labels, reversed, so
 * `dev.ucp.shopping.checkout` is `ucp.dev` (UCP overview, Authority Binding).
 * ponytail: covers two-label authorities; names under a multi-label suffix need the full algorithm.
 */
export function ucpAuthority(capability) {
    const [first, second] = capability.split(".");
    return `${second ?? ""}.${first ?? ""}`;
}
function boundToAuthority(name, capability) {
    if (capability.schema === undefined)
        return true;
    try {
        const host = new URL(capability.schema).hostname.toLowerCase();
        const authority = ucpAuthority(name);
        return host === authority || host.endsWith(`.${authority}`);
    }
    catch {
        return false;
    }
}
/** Parses a UCP profile document. Capabilities whose schema isn't on their namespace's authority are dropped. */
export function parseUcpProfile(body, url) {
    if (!isObject(body) || !isObject(body["ucp"]))
        throw new PoppyProtocolError("UCP profile must have a ucp object");
    const ucp = body["ucp"];
    const version = ucp["version"];
    if (typeof version !== "string" || !DATE_VERSION.test(version))
        throw new PoppyProtocolError("ucp.version must be a YYYY-MM-DD date");
    if (ucp["services"] === undefined || ucp["payment_handlers"] === undefined)
        throw new PoppyProtocolError("ucp.services and ucp.payment_handlers are required");
    const services = record(ucp["services"], "ucp.services", (entry, name) => list(entry, `ucp.services.${name}`).map((binding) => ({
        version: typeof binding["version"] === "string" ? binding["version"] : version,
        transport: typeof binding["transport"] === "string" ? binding["transport"] : "",
        endpoint: typeof binding["endpoint"] === "string"
            ? httpsUrl(binding["endpoint"], `${name} endpoint`).href.replace(/\/$/, "")
            : undefined,
        spec: typeof binding["spec"] === "string" ? binding["spec"] : undefined,
        schema: typeof binding["schema"] === "string" ? binding["schema"] : undefined,
    })));
    const capabilities = Object.fromEntries(Object.entries(ucp["capabilities"] === undefined
        ? {}
        : record(ucp["capabilities"], "ucp.capabilities", (entry, name) => list(entry, `ucp.capabilities.${name}`)
            .filter((c) => typeof c["version"] === "string")
            .map((c) => c)
            .filter((c) => boundToAuthority(name, c)))).filter(([, versions]) => versions.length > 0));
    const supported = ucp["supported_versions"];
    return {
        url,
        version,
        supportedVersions: isObject(supported)
            ? Object.fromEntries(Object.entries(supported).filter((entry) => DATE_VERSION.test(entry[0]) && typeof entry[1] === "string"))
            : {},
        services,
        capabilities,
        paymentHandlers: record(ucp["payment_handlers"], "ucp.payment_handlers", (entry, name) => list(entry, `ucp.payment_handlers.${name}`)),
        keys: Array.isArray(body["keys"]) ? body["keys"].filter(isObject) : [],
    };
}
/**
 * Fetches a business's UCP profile from `https://{domain}/.well-known/ucp`. UCP profiles are never served
 * through a redirect, and special-use addresses are refused.
 */
export async function discoverUcp(website, options = {}) {
    const base = httpsUrl(website.includes("://") ? website : `https://${website}`, "website");
    const url = new URL("/.well-known/ucp", base.origin);
    return fetchProfile(url, options);
}
async function fetchProfile(url, options) {
    const { body } = await getJson(options.fetch ?? fetch, url, "UCP profile", {
        allowPrivate: options.allowPrivateAddresses ?? false,
        followRedirects: false,
    });
    return parseUcpProfile(body, url.href);
}
/**
 * Fetches the UCP profile of a Company that lists the UCP extension, from `https://{domain}/.well-known/ucp`
 * on its validated domain, without following redirects (UCP extension 3).
 */
export async function discoverCompanyUcp(company, options = {}) {
    if (company.ucp === undefined)
        throw new PoppyProtocolError(`${company.domain} doesn't list the UCP extension, version 1`);
    return fetchProfile(new URL(company.ucp.profileUrl), options);
}
/**
 * Computes the capabilities both sides support: by name, then the highest shared version, then
 * extensions whose parents survived, repeated until nothing more is dropped (UCP overview, Intersection).
 */
export function intersectCapabilities(business, platform) {
    const shared = {};
    for (const [name, ours] of Object.entries(platform)) {
        const theirs = business[name];
        if (theirs === undefined)
            continue;
        const versions = ours
            .map((capability) => capability.version)
            .filter((version) => theirs.some((capability) => capability.version === version))
            .sort();
        const best = versions.at(-1);
        if (best === undefined)
            continue;
        const chosen = theirs.find((capability) => capability.version === best);
        if (chosen !== undefined)
            shared[name] = chosen;
    }
    for (let changed = true; changed;) {
        changed = false;
        for (const [name, capability] of Object.entries(shared)) {
            const parents = capability.extends === undefined
                ? []
                : Array.isArray(capability.extends)
                    ? capability.extends
                    : [capability.extends];
            if (parents.length > 0 && !parents.some((parent) => parent in shared)) {
                delete shared[name];
                changed = true;
            }
        }
    }
    return shared;
}
/**
 * Picks the newest protocol version both sides support, fetching the business's profile for an older
 * version if needed, and intersects capabilities. Rejects with `version_unsupported` when there is none.
 */
export async function negotiateUcp(business, platform, options = {}) {
    const version = platform.version ?? UCP_VERSION;
    let profile = business;
    if (version !== business.version) {
        const url = business.supportedVersions[version];
        if (url === undefined)
            throw new PoppyError("version_unsupported", {
                description: `the business doesn't support UCP ${version}`,
            });
        profile = await fetchProfile(httpsUrl(url, "supported_versions profile"), options);
        if (profile.version !== version)
            throw new PoppyProtocolError(`the profile for ${version} declares ${profile.version}`);
    }
    const bindings = profile.services[options.service ?? "dev.ucp.shopping"] ?? [];
    const endpoint = (transport) => (bindings.find((b) => b.transport === transport && b.version === version) ??
        bindings.find((b) => b.transport === transport))?.endpoint;
    return {
        business: profile,
        version,
        capabilities: intersectCapabilities(profile.capabilities, platform.capabilities),
        restEndpoint: endpoint("rest"),
        mcpEndpoint: endpoint("mcp"),
    };
}
/**
 * The OAuth scopes to request for UCP Identity Linking: the business's `config.scopes` for the
 * identity-linking capability, kept to those of capabilities both sides support (`{capability}:{scope}`).
 */
export function ucpIdentityScopes(negotiation) {
    const linking = negotiation.business.capabilities["dev.ucp.common.identity_linking"]?.at(-1);
    const scopes = linking?.config?.["scopes"];
    const names = Array.isArray(scopes)
        ? scopes.filter((s) => typeof s === "string")
        : isObject(scopes)
            ? Object.keys(scopes)
            : [];
    return names.filter((scope) => (scope.split(":")[0] ?? "") in negotiation.capabilities);
}
/** A UCP error: the `messages` of an error response, or a transport error's `code` (UCP overview). */
export class UcpError extends PoppyError {
    name = "UcpError";
    messages;
    /** Where to hand the buyer over to finish in the business's own interface. */
    continueUrl;
    constructor(code, options) {
        super(code, {
            status: options.status,
            description: options.description,
            retryAfter: options.retryAfter,
        });
        this.messages = options.messages ?? [];
        this.continueUrl = options.continueUrl;
    }
}
const SF_STRING = /^[\x20-\x7e]*$/;
function sfString(value) {
    if (!SF_STRING.test(value))
        throw new PoppyProtocolError("not a printable ASCII string");
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
/**
 * A UCP REST client for one business. Every request carries `UCP-Agent` and `Request-Id`, mutating ones
 * an `Idempotency-Key`, and bodies a `Content-Digest`. With a signer, it signs `@method`, `@authority`,
 * `@path`, `@query`, `ucp-agent`, `idempotency-key`, `content-digest` and `content-type`.
 */
export class UcpClient {
    negotiation;
    #options;
    #endpoint;
    #agentHeader;
    constructor(options) {
        if (options.negotiation.restEndpoint === undefined)
            throw new PoppyProtocolError("the business offers no UCP REST endpoint");
        if (options.signer !== undefined && options.signer.alg !== "ES256")
            throw new PoppyProtocolError("UCP request signatures use ES256, which every business verifies");
        const { session } = options;
        if (session !== undefined) {
            const { company } = session;
            if (company.ucp === undefined)
                throw new PoppyProtocolError(`${company.domain} doesn't list the UCP extension, so UCP requests can't use its Session`);
            // A profile from another host doesn't apply to this Company (UCP extension 3).
            if (new URL(options.negotiation.business.url).hostname !== company.domain)
                throw new PoppyProtocolError(`the UCP profile isn't from ${company.domain}`);
            session.addExtensionEndpoint(options.negotiation.restEndpoint);
        }
        this.negotiation = options.negotiation;
        this.#options = options;
        this.#endpoint = options.negotiation.restEndpoint;
        this.#agentHeader = `profile=${sfString(httpsUrl(options.profileUrl, "profileUrl").href)}`;
    }
    /** Sends one UCP REST request and returns its JSON body, throwing {@link UcpError} on an error. */
    async request(method, path, body, options = {}) {
        const url = new URL(`${this.#endpoint}${path}`);
        for (const [key, value] of Object.entries(options.query ?? {}))
            url.searchParams.set(key, value);
        const upper = method.toUpperCase();
        const headers = new Headers({ accept: "application/json", "ucp-agent": this.#agentHeader });
        headers.set("request-id", crypto.randomUUID());
        const mutating = upper !== "GET" && upper !== "HEAD";
        if (mutating)
            headers.set("idempotency-key", options.idempotencyKey ?? randomId());
        let text;
        if (body !== undefined) {
            text = JSON.stringify(body);
            headers.set("content-type", "application/json");
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            headers.set("content-digest", `sha-256=:${Buffer.from(digest).toString("base64")}:`);
        }
        if (this.#options.signer !== undefined)
            await this.#sign(upper, url, headers, this.#options.signer);
        const init = { method: upper, headers, ...(text === undefined ? {} : { body: text }) };
        const session = this.#options.session;
        let response;
        if (session !== undefined) {
            response = await session.fetch(url, {
                ...init,
                ...(options.signedOut === undefined ? {} : { signedOut: options.signedOut }),
            });
        }
        else {
            checkPublicHost(url, "UCP endpoint", this.#options.allowPrivateAddresses ?? false);
            response = await (this.#options.fetch ?? fetch)(url, { ...init, redirect: "manual" });
        }
        return parseUcpResponse(response);
    }
    async #sign(method, url, headers, signer) {
        const components = [
            ["@method", method],
            ["@authority", url.host.toLowerCase()],
            ["@path", url.pathname],
        ];
        if (url.search !== "")
            components.push(["@query", url.search]);
        for (const name of ["ucp-agent", "idempotency-key", "content-digest", "content-type"]) {
            const value = headers.get(name);
            if (value !== null)
                components.push([name, value]);
        }
        const params = `(${components.map(([name]) => `"${name}"`).join(" ")});keyid=${sfString(signer.kid)}`;
        const base = [
            ...components.map(([name, value]) => `"${name}": ${value}`),
            `"@signature-params": ${params}`,
        ].join("\n");
        addSignature(headers, "sig1", params, await signer.sign(new TextEncoder().encode(base)));
    }
    createCheckout(checkout, options) {
        return this.request("POST", "/checkout-sessions", checkout, options);
    }
    getCheckout(id) {
        return this.request("GET", `/checkout-sessions/${encodeURIComponent(id)}`);
    }
    updateCheckout(id, checkout, options) {
        return this.request("PUT", `/checkout-sessions/${encodeURIComponent(id)}`, checkout, options);
    }
    /**
     * Places the order. Retry only with the same `idempotencyKey`, and poll with {@link getCheckout}, never
     * with Complete again. Ask the User before calling it.
     */
    completeCheckout(id, body, options) {
        return this.request("POST", `/checkout-sessions/${encodeURIComponent(id)}/complete`, body, options);
    }
    cancelCheckout(id, options) {
        return this.request("POST", `/checkout-sessions/${encodeURIComponent(id)}/cancel`, {}, options);
    }
    createCart(cart, options) {
        return this.request("POST", "/carts", cart, options);
    }
    getCart(id) {
        return this.request("GET", `/carts/${encodeURIComponent(id)}`);
    }
    updateCart(id, cart, options) {
        return this.request("PUT", `/carts/${encodeURIComponent(id)}`, cart, options);
    }
    searchCatalog(query, options) {
        return this.request("POST", "/catalog/search", query, options);
    }
    lookupCatalog(query, options) {
        return this.request("POST", "/catalog/lookup", query, options);
    }
    getOrder(id) {
        return this.request("GET", `/orders/${encodeURIComponent(id)}`);
    }
}
/** Reads a UCP response, throwing {@link UcpError} for transport errors and `ucp.status: "error"`. */
export async function parseUcpResponse(response) {
    if (isRedirect(response)) {
        await response.body?.cancel();
        throw new PoppyProtocolError("the UCP endpoint redirected");
    }
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    let body;
    try {
        body = await response.json();
    }
    catch {
        body = undefined;
    }
    const messages = isObject(body) && Array.isArray(body["messages"])
        ? body["messages"].filter(isObject)
        : [];
    const continueUrl = isObject(body) && typeof body["continue_url"] === "string" ? body["continue_url"] : undefined;
    const ucpStatus = isObject(body) && isObject(body["ucp"]) ? body["ucp"]["status"] : undefined;
    if (!response.ok || ucpStatus === "error") {
        const error = messages.find((m) => m.type === "error") ?? messages[0];
        const code = (isObject(body) && typeof body["code"] === "string" ? body["code"] : undefined) ??
            error?.code ??
            (response.status === 429 ? "rate_limited" : `http_${response.status}`);
        throw new UcpError(code, {
            status: response.status,
            messages,
            continueUrl,
            description: ((isObject(body) && typeof body["content"] === "string" ? body["content"] : undefined) ??
                error?.content)?.slice(0, 200),
            retryAfter,
        });
    }
    if (!isObject(body))
        throw new PoppyProtocolError("UCP response must be a JSON object");
    return body;
}
/**
 * Where to hand the buyer over when a checkout needs them (`requires_escalation`), which the platform
 * must use (UCP checkout). Undefined otherwise.
 */
export function ucpHandoffUrl(checkout) {
    if (checkout["status"] !== "requires_escalation")
        return undefined;
    return typeof checkout["continue_url"] === "string" ? checkout["continue_url"] : undefined;
}
/**
 * The `meta` a UCP MCP tool call carries in its arguments (UCP MCP binding): the agent profile, and an
 * idempotency key for `complete_checkout` and `cancel_checkout`.
 */
export function ucpMcpArguments(profileUrl, args, options = {}) {
    return {
        ...args,
        meta: {
            "ucp-agent": { profile: httpsUrl(profileUrl, "profileUrl").href },
            ...(options.idempotencyKey === undefined
                ? {}
                : { "idempotency-key": options.idempotencyKey }),
        },
    };
}
//# sourceMappingURL=ucp.js.map