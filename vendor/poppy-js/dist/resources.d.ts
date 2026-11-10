import type { Company } from "./discovery.ts";
import { type Fetch } from "./http.ts";
/** Which access token a request uses (spec 4.5). */
export interface ResourceChoice {
    /** The `resource` to request a token for, or undefined for the Company's default token. */
    resource: string | undefined;
    /** The service the request belongs to, if it matched one. */
    service: string | undefined;
    /** False for an MCP server that publishes no resource metadata, and so offers no account access (spec 7). */
    accountAccess?: false;
}
/** Finds the first `servers` URL in an OpenAPI description, JSON or YAML. */
export declare function openApiServer(text: string, descriptionUrl: string): string;
/**
 * Resolves, for each request URL, whether it may carry the Session header (spec 5.2) and whether its
 * service needs a token for its own `resource` (spec 4.5). One per Company, shared by its Users, since
 * metadata is public.
 */
export declare class ResourceResolver {
    #private;
    constructor(company: Company, fetchFn: Fetch, allowPrivate: boolean);
    resolve(url: URL): Promise<ResourceChoice>;
    /**
     * Whether a request URL is a destination for the Company's Session header (spec 5.2): a request URL a
     * listed API describes, or a protocol or extension endpoint from `poppy.json` or derived from one. A
     * shared hostname alone doesn't make a URL a destination.
     */
    isDestination(url: URL): Promise<boolean>;
    /** Adds an endpoint an extension defines, so requests under it carry the Session header. */
    addExtensionEndpoint(endpoint: string): void;
    /** Forgets cached metadata, after a service says a token wasn't issued for it (spec 4.5). */
    forget(service: string | undefined): void;
}
