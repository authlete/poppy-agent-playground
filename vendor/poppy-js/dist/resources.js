import { PoppyProtocolError } from "./errors.js";
import { getJson, getText, isObject, originOf, resourceMetadataUrl } from "./http.js";
const DEFAULT = { resource: undefined, service: undefined };
/** Finds the first `servers` URL in an OpenAPI description, JSON or YAML. */
export function openApiServer(text, descriptionUrl) {
    let server;
    try {
        const doc = JSON.parse(text);
        if (isObject(doc) && Array.isArray(doc["servers"]) && isObject(doc["servers"][0]))
            server = doc["servers"][0]["url"];
    }
    catch {
        // ponytail: a minimal YAML read of the first `servers` entry, enough for typical descriptions.
        server = /^servers:\s*\n\s*-\s*url:\s*["']?([^"'\s#]+)/m.exec(text)?.[1];
    }
    // Without servers, OpenAPI's default server is `/`, relative to the description.
    return new URL(typeof server === "string" ? server : "/", descriptionUrl).href;
}
/**
 * Resolves, for each request URL, whether it may carry the Session header (spec 5.2) and whether its
 * service needs a token for its own `resource` (spec 4.5). One per Company, shared by its Users, since
 * metadata is public.
 */
export class ResourceResolver {
    #company;
    #fetch;
    #allowPrivate;
    #choices = new Map();
    /** Each OpenAPI description's server, by description URL. Failures aren't kept, so they're retried. */
    #openApiServers = new Map();
    /** Endpoints an extension defines that `poppy.json` doesn't list, such as UCP services (UCP extension 2). */
    #extensionEndpoints = new Set();
    constructor(company, fetchFn, allowPrivate) {
        this.#company = company;
        this.#fetch = fetchFn;
        this.#allowPrivate = allowPrivate;
    }
    async resolve(url) {
        const service = await this.#service(url);
        if (service === undefined)
            return DEFAULT;
        let choice = this.#choices.get(service.url);
        if (choice === undefined) {
            choice = this.#lookup(service);
            this.#choices.set(service.url, choice);
            choice.catch(() => this.#choices.delete(service.url));
        }
        return choice;
    }
    /**
     * Whether a request URL is a destination for the Company's Session header (spec 5.2): a request URL a
     * listed API describes, or a protocol or extension endpoint from `poppy.json` or derived from one. A
     * shared hostname alone doesn't make a URL a destination.
     */
    async isDestination(url) {
        const target = `${url.origin}${url.pathname}`;
        const company = this.#company;
        const exact = [
            company.feedbackEndpoint,
            company.browserSessionEndpoint === undefined
                ? undefined
                : `${company.browserSessionEndpoint.replace(/\/$/, "")}/authorize`,
        ];
        if (exact.includes(target))
            return true;
        const prefixes = [
            ...company.apis.filter((api) => api.type === "mcp").map((api) => api.url),
            ...company.conversationProtocols.map((p) => p.endpoint),
            ...Object.values(company.extensions).flatMap((entry) => typeof entry["endpoint"] === "string" ? [entry["endpoint"]] : []),
            ...this.#extensionEndpoints,
        ].map((prefix) => ({ url: prefix, mcp: false }));
        if (longestPrefix(prefixes, target) !== undefined)
            return true;
        const openapi = company.apis.filter((api) => api.type === "openapi");
        return longestPrefix(await this.#loadOpenApiServers(openapi), target) !== undefined;
    }
    /** Adds an endpoint an extension defines, so requests under it carry the Session header. */
    addExtensionEndpoint(endpoint) {
        this.#extensionEndpoints.add(endpoint);
    }
    /** Forgets cached metadata, after a service says a token wasn't issued for it (spec 4.5). */
    forget(service) {
        if (service !== undefined)
            this.#choices.delete(service);
        // The request matched no service, so the OpenAPI servers may be stale or never loaded.
        else
            this.#openApiServers.clear();
    }
    async #service(url) {
        const target = `${url.origin}${url.pathname}`;
        const candidates = [
            ...this.#company.apis
                .filter((api) => api.type === "mcp")
                .map((api) => ({ url: api.url, mcp: true })),
            ...this.#company.conversationProtocols.map((p) => ({ url: p.endpoint, mcp: false })),
        ];
        const direct = longestPrefix(candidates, target);
        if (direct !== undefined)
            return direct;
        const openapi = this.#company.apis.filter((api) => api.type === "openapi");
        if (openapi.length === 0)
            return undefined;
        return longestPrefix(await this.#loadOpenApiServers(openapi), target);
    }
    async #loadOpenApiServers(apis) {
        const servers = await Promise.all(apis.map((api) => {
            let server = this.#openApiServers.get(api.url);
            if (server === undefined) {
                server = getText(this.#fetch, new URL(api.url), "OpenAPI description", this.#allowPrivate)
                    .then((text) => ({ url: openApiServer(text, api.url), mcp: false }))
                    .catch(() => {
                    this.#openApiServers.delete(api.url);
                    return undefined;
                });
                this.#openApiServers.set(api.url, server);
            }
            return server;
        }));
        return servers.filter((server) => server !== undefined);
    }
    async #lookup(service) {
        const { status, body } = await getJson(this.#fetch, resourceMetadataUrl(service.url), "protected resource metadata", { allowPrivate: this.#allowPrivate, allowNotFound: true });
        if (status === 404)
            return service.mcp
                ? { ...DEFAULT, service: service.url, accountAccess: false }
                : { ...DEFAULT, service: service.url };
        if (!isObject(body) || typeof body["resource"] !== "string")
            throw new PoppyProtocolError("protected resource metadata must name its resource");
        const resource = body["resource"];
        if (service.mcp && resource !== service.url)
            throw new PoppyProtocolError(`MCP server metadata resource must equal ${service.url}`);
        // The domain's own resource means the default token works here (spec 4.5).
        if (!service.mcp && resource === originOf(this.#company.domain))
            return { ...DEFAULT, service: service.url };
        return { resource, service: service.url };
    }
}
function longestPrefix(services, target) {
    let best;
    for (const service of services) {
        const base = service.url.replace(/\/$/, "");
        if (target !== base && !target.startsWith(`${base}/`))
            continue;
        if (best === undefined || service.url.length > best.url.length)
            best = service;
    }
    return best;
}
//# sourceMappingURL=resources.js.map