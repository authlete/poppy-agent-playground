import { type Fetch } from "./http.ts";
/** The `major.minor` versions of `poppy.json` this client follows (spec 3.1). */
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly string[];
export declare const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export declare const MEDIATED_SIGN_IN_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";
/** One entry of `apis` (spec section 7). Entries of unknown types are dropped. */
export interface Api {
    type: "openapi" | "mcp";
    url: string;
    description: string | undefined;
}
/** One `poppy` entry of `agent.protocols` (spec 3.2, 8.1). */
export interface ConversationProtocol {
    type: "poppy";
    endpoint: string;
    /** `signed_in` when the interface needs account access before useful work can begin (spec 3.2). */
    access: "session" | "signed_in";
}
/** What a scope allows, from `auth.scope_hints` (spec 4.7). */
export interface ScopeHint {
    /** Unknown values are read as `irreversible`. */
    changes: "none" | "reversible" | "irreversible";
    personalData: boolean;
}
/** A field of the Mediated Sign-In extension (extension section 2). */
export interface MediatedSignInField {
    name: string;
    label: string;
    secret: boolean;
}
export interface MediatedSignInConfig {
    fields: readonly MediatedSignInField[];
    scopes: readonly string[];
}
/** The OAuth server metadata this client uses (spec 3.2). */
export interface OAuthServer {
    issuer: string;
    tokenEndpoint: string;
    revocationEndpoint: string;
    authorizationEndpoint: string | undefined;
    deviceAuthorizationEndpoint: string | undefined;
    grantTypesSupported: readonly string[];
    scopesSupported: readonly string[] | undefined;
    /** `protected_resources`, as published. */
    protectedResources: readonly string[];
    /** `dpop_signing_alg_values_supported`; the client sends DPoP proofs when it lists ES256 (spec 4.5). */
    dpopSigningAlgValuesSupported: readonly string[] | undefined;
    /** `token_endpoint_auth_signing_alg_values_supported` (spec 4.1). */
    tokenEndpointAuthSigningAlgValuesSupported: readonly string[] | undefined;
}
/** One skill from `skill_index` (spec 9.4). Content from the Company: it grants nothing. */
export interface Skill {
    name: string;
    description: string;
    /** `skill-md` for a single `SKILL.md`, or `archive` for a skill with supporting files. */
    type: "skill-md" | "archive";
    /** Resolved against the final `poppy.json` URL. May be on another domain, which gets no credentials. */
    url: string;
    /** `sha256:` and the artifact's SHA-256 in lowercase hex. {@link fetchSkill} checks it. */
    digest: string;
}
/** The Agent Skills discovery schema `skill_index` uses (spec 9.4). Other values are ignored. */
export declare const SKILL_INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
/** How the Company connects through the UCP extension, version 1. */
export interface UcpExtensionInfo {
    /** `https://{domain}/.well-known/ucp`, fetched without following redirects (UCP extension 3). */
    profileUrl: string;
    /** Whether `agent.protocols` lists UCP Ask as a conversation protocol (UCP extension 5). */
    ask: boolean;
}
/** An extension entry from `poppy.json` (spec 3.3), with its own fields kept as published. */
export interface ExtensionEntry {
    version: string;
    [field: string]: unknown;
}
/** A Company's `poppy.json` and OAuth metadata, after every check in spec section 3. */
export interface Company {
    protocolVersion: string;
    /** The host that served `poppy.json`, after redirects; equals `organization.domain`, lowercased. */
    domain: string;
    name: string;
    /** `organization.logo_uri`. Show it with the Company's name and domain (spec 3.1). */
    logoUri: string | undefined;
    /**
     * The Company's identifier (spec 3.2): its issuer when it has one, else `https://{domain}`. Session JWTs
     * name it in `aud`, and User IDs are scoped by it.
     */
    identifier: string;
    /** Undefined when the Company has no issuer, and so offers only signed-out Sessions. */
    oauth: OAuthServer | undefined;
    /**
     * Sign-in types the Company offers (spec 4, Mediated Sign-In extension). All are off when it sets
     * `auth.disabled` (spec 3.2). The Company can still refuse one to your agent with `unauthorized_client`.
     */
    signIn: {
        /** `auth.disabled`: the Company offers Personal Agents no sign-in, though it has an issuer. */
        disabled: boolean;
        direct: boolean;
        device: boolean;
        mediated: MediatedSignInConfig | undefined;
    };
    /** Scope descriptions from `auth.scopes` (spec 4.7). */
    scopes: Readonly<Record<string, string>>;
    scopeHints: Readonly<Record<string, ScopeHint>>;
    conversationProtocols: readonly ConversationProtocol[];
    apis: readonly Api[];
    browserSessionEndpoint: string | undefined;
    feedbackEndpoint: string | undefined;
    excludedTasksUrl: string | undefined;
    extensions: Readonly<Record<string, ExtensionEntry>>;
    /** Skills from `skill_index` (spec 9.4), or empty when it's absent or its `$schema` is unknown. */
    skills: readonly Skill[];
    /** Set when the Company lists the UCP extension, version 1. */
    ucp: UcpExtensionInfo | undefined;
}
export interface DiscoverOptions {
    /** Defaults to the global `fetch`. Every request is sent with `redirect: "manual"`. */
    fetch?: Fetch;
    /** Allow loopback, private and link-local hosts, such as `localhost` in tests. Off by default (spec 3). */
    allowPrivateAddresses?: boolean;
}
/**
 * Fetches a Company's `poppy.json`, its domain's protected resource metadata and its issuer's OAuth
 * metadata, and checks them as spec section 3 requires. Throws {@link PoppyProtocolError} on any failed
 * check, so nothing is sent to a Company that did not prove the link between its domain and issuer.
 */
export declare function discover(website: string, options?: DiscoverOptions): Promise<Company>;
/** Whether the Company lists `name` at `version` in its `extensions` (spec 3.3). */
export declare function companySupports(company: Company, name: string, version: string): boolean;
