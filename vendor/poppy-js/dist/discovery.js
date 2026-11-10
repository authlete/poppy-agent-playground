import { PoppyProtocolError } from "./errors.js";
import { authorizationServerMetadataUrl, checkPublicHost, getJson, httpsUrl, isObject, originOf, resourceMetadataUrl, } from "./http.js";
/** The `major.minor` versions of `poppy.json` this client follows (spec 3.1). */
export const SUPPORTED_PROTOCOL_VERSIONS = ["0.3"];
export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export const MEDIATED_SIGN_IN_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";
/** The Agent Skills discovery schema `skill_index` uses (spec 9.4). Other values are ignored. */
export const SKILL_INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
function string(value, what) {
    if (typeof value !== "string" || value === "")
        throw new PoppyProtocolError(`${what} is missing`);
    return value;
}
function optionalStringList(value, what) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new PoppyProtocolError(`${what} must be a list of strings`);
    }
    return value;
}
function websiteUrl(website) {
    const url = httpsUrl(website.includes("://") ? website : `https://${website}`, "website");
    return new URL("/.well-known/poppy.json", url.origin);
}
/** Unknown API types are skipped unchecked so later types can be added (spec 7). */
function parseApis(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        throw new PoppyProtocolError("apis must be a list");
    const apis = [];
    value.forEach((entry, index) => {
        if (!isObject(entry))
            throw new PoppyProtocolError(`apis[${index}] must be an object`);
        const type = entry["type"];
        if (type !== "openapi" && type !== "mcp")
            return;
        apis.push({
            type,
            url: httpsUrl(entry["url"], `apis[${index}].url`).href,
            description: typeof entry["description"] === "string" ? entry["description"] : undefined,
        });
    });
    return apis;
}
/** Unknown protocol types are skipped, and unknown `access` values read as absent (spec 3.2, 8.1). */
function parseProtocols(agent) {
    if (agent === undefined)
        return [];
    if (!isObject(agent) || !Array.isArray(agent["protocols"]))
        throw new PoppyProtocolError("agent.protocols must be a list");
    return agent["protocols"].flatMap((protocol, index) => {
        if (!isObject(protocol) || protocol["type"] !== "poppy")
            return [];
        return [
            {
                type: "poppy",
                endpoint: httpsUrl(protocol["endpoint"], `agent.protocols[${index}].endpoint`).href,
                access: protocol["access"] === "signed_in" ? "signed_in" : "session",
            },
        ];
    });
}
function parseScopes(value) {
    if (!isObject(value))
        return {};
    return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === "string"));
}
function parseScopeHints(value) {
    if (!isObject(value))
        return {};
    const hints = {};
    for (const [scope, hint] of Object.entries(value)) {
        if (!isObject(hint))
            continue;
        const changes = hint["changes"];
        hints[scope] = {
            changes: changes === "none" || changes === "reversible" ? changes : "irreversible",
            // A missing or unknown value is read as the more consequential answer.
            personalData: hint["personal_data"] !== false,
        };
    }
    return hints;
}
function parseExtensions(value) {
    if (!isObject(value))
        return {};
    const extensions = {};
    for (const [name, entry] of Object.entries(value)) {
        if (isObject(entry) && typeof entry["version"] === "string")
            extensions[name] = entry;
    }
    return extensions;
}
const RESERVED_MEDIATED_FIELDS = new Set([
    "grant_type",
    "scope",
    "resource",
    "client_id",
    "client_secret",
    "client_assertion",
    "client_assertion_type",
    "sign_in_id",
    "one_time_code",
]);
function parseMediated(entry) {
    if (entry === undefined || entry.version !== "1")
        return undefined;
    const fields = entry["fields"];
    const scopes = entry["scopes"];
    if (!Array.isArray(fields) || !Array.isArray(scopes))
        return undefined;
    const parsed = [];
    for (const field of fields) {
        if (!isObject(field) || typeof field["name"] !== "string" || field["name"] === "")
            throw new PoppyProtocolError("mediated-sign-in fields need a name");
        if (RESERVED_MEDIATED_FIELDS.has(field["name"]))
            throw new PoppyProtocolError(`mediated-sign-in field ${field["name"]} is a reserved name`);
        parsed.push({
            name: field["name"],
            label: typeof field["label"] === "string" ? field["label"] : field["name"],
            // Treat a field as secret unless the Company says it isn't.
            secret: field["secret"] !== false,
        });
    }
    return {
        fields: parsed,
        scopes: scopes.filter((scope) => typeof scope === "string"),
    };
}
const DIGEST = /^sha256:[0-9a-f]{64}$/;
/**
 * Reads `skill_index` (spec 9.4). The index is ignored when `$schema` is absent or unknown, and entries of
 * an unknown `type`, or that are malformed, are skipped, so the rest of `poppy.json` stays usable.
 */
function parseSkillIndex(value, base) {
    if (!isObject(value) ||
        value["$schema"] !== SKILL_INDEX_SCHEMA ||
        !Array.isArray(value["skills"]))
        return [];
    return value["skills"].flatMap((entry) => {
        if (!isObject(entry))
            return [];
        const { name, description, type, url, digest } = entry;
        if (typeof name !== "string" || typeof description !== "string" || typeof url !== "string")
            return [];
        if ((type !== "skill-md" && type !== "archive") || typeof digest !== "string")
            return [];
        if (!DIGEST.test(digest))
            return [];
        let resolved;
        try {
            // RFC 3986 section 5, against the final poppy.json URL.
            resolved = new URL(url, base);
        }
        catch {
            return [];
        }
        if (resolved.protocol !== "https:")
            return [];
        return [{ name, description, type, url: resolved.href, digest }];
    });
}
function parseUcp(extensions, agent, domain) {
    if (extensions["ucp"]?.version !== "1")
        return undefined;
    const profileUrl = `${originOf(domain)}/.well-known/ucp`;
    const protocols = isObject(agent) && Array.isArray(agent["protocols"]) ? agent["protocols"] : [];
    const ask = protocols.some((protocol) => isObject(protocol) && protocol["type"] === "ucp" && protocol["endpoint"] === profileUrl);
    return { profileUrl, ask };
}
function optionalUrl(container, key, what) {
    if (!isObject(container) || container[key] === undefined)
        return undefined;
    return httpsUrl(container[key], what).href;
}
/**
 * Finds the issuer from the domain's protected resource metadata (spec 3.2). Returns undefined when the
 * Company has no issuer, which only a 404 or an empty `authorization_servers` establishes.
 */
async function findIssuer(fetchFn, domain, authIssuer, allowPrivate) {
    const resource = originOf(domain);
    const { status, body } = await getJson(fetchFn, resourceMetadataUrl(resource), "protected resource metadata", { allowPrivate, allowNotFound: true });
    let servers = [];
    if (status !== 404) {
        if (!isObject(body))
            throw new PoppyProtocolError("protected resource metadata must be an object");
        if (body["resource"] !== resource)
            throw new PoppyProtocolError(`protected resource metadata resource must be ${resource}`);
        servers = optionalStringList(body["authorization_servers"], "authorization_servers") ?? [];
    }
    if (servers.length === 0) {
        if (authIssuer !== undefined)
            throw new PoppyProtocolError("auth.issuer is set, but the domain names no issuer");
        return undefined;
    }
    if (servers.length === 1) {
        if (authIssuer !== undefined && authIssuer !== servers[0])
            throw new PoppyProtocolError("auth.issuer must name the domain's authorization server");
        return servers[0];
    }
    if (authIssuer === undefined)
        throw new PoppyProtocolError("the domain lists several issuers, so auth.issuer is required");
    if (!servers.includes(authIssuer))
        throw new PoppyProtocolError("auth.issuer is not one of the domain's authorization servers");
    return authIssuer;
}
/** RFC 9728 section 3.3 comparison, with the host compared ignoring case (spec 3.2). */
function listsDomain(protectedResources, domain) {
    return protectedResources.some((entry) => {
        const match = /^https:\/\/([^/?#:@]+)$/i.exec(entry);
        return match?.[1]?.toLowerCase() === domain;
    });
}
async function fetchOAuthServer(fetchFn, issuer, domain, allowPrivate) {
    httpsUrl(issuer, "issuer");
    const { body } = await getJson(fetchFn, authorizationServerMetadataUrl(issuer), "OAuth metadata", { allowPrivate });
    if (!isObject(body))
        throw new PoppyProtocolError("OAuth metadata must be an object");
    if (body["issuer"] !== issuer)
        throw new PoppyProtocolError("OAuth metadata issuer does not match the Company's issuer");
    const protectedResources = optionalStringList(body["protected_resources"], "protected_resources") ?? [];
    if (!listsDomain(protectedResources, domain))
        throw new PoppyProtocolError(`protected_resources does not list https://${domain}`);
    const grantTypes = optionalStringList(body["grant_types_supported"], "grant_types_supported");
    if (grantTypes === undefined || !grantTypes.includes("refresh_token"))
        throw new PoppyProtocolError("grant_types_supported must include refresh_token");
    const endpoint = (key, required) => required || body[key] !== undefined ? httpsUrl(body[key], key).href : undefined;
    return {
        issuer,
        tokenEndpoint: string(endpoint("token_endpoint", true), "token_endpoint"),
        revocationEndpoint: string(endpoint("revocation_endpoint", true), "revocation_endpoint"),
        authorizationEndpoint: endpoint("authorization_endpoint", grantTypes.includes("authorization_code")),
        deviceAuthorizationEndpoint: endpoint("device_authorization_endpoint", grantTypes.includes(DEVICE_CODE_GRANT)),
        grantTypesSupported: grantTypes,
        scopesSupported: optionalStringList(body["scopes_supported"], "scopes_supported"),
        protectedResources,
        dpopSigningAlgValuesSupported: optionalStringList(body["dpop_signing_alg_values_supported"], "dpop_signing_alg_values_supported"),
        tokenEndpointAuthSigningAlgValuesSupported: optionalStringList(body["token_endpoint_auth_signing_alg_values_supported"], "token_endpoint_auth_signing_alg_values_supported"),
    };
}
/**
 * Fetches a Company's `poppy.json`, its domain's protected resource metadata and its issuer's OAuth
 * metadata, and checks them as spec section 3 requires. Throws {@link PoppyProtocolError} on any failed
 * check, so nothing is sent to a Company that did not prove the link between its domain and issuer.
 */
export async function discover(website, options = {}) {
    const fetchFn = options.fetch ?? fetch;
    const allowPrivate = options.allowPrivateAddresses ?? false;
    const { body: doc, url: finalUrl } = await getJson(fetchFn, websiteUrl(website), "poppy.json", {
        allowPrivate,
    });
    // A redirect may only end at the well-known path, so an uploaded file can't speak for a domain (spec 3).
    if (finalUrl.pathname !== "/.well-known/poppy.json" || finalUrl.search !== "")
        throw new PoppyProtocolError("poppy.json redirected away from /.well-known/poppy.json");
    if (!isObject(doc))
        throw new PoppyProtocolError("poppy.json must be an object");
    const version = string(doc["protocol_version"], "protocol_version");
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
        throw new PoppyProtocolError(`protocol_version ${version} is not supported`);
    }
    const organization = doc["organization"];
    if (!isObject(organization))
        throw new PoppyProtocolError("organization is missing");
    const domain = string(organization["domain"], "organization.domain").toLowerCase();
    if (domain !== finalUrl.hostname.toLowerCase()) {
        throw new PoppyProtocolError(`organization.domain ${domain} does not match the host that served it`);
    }
    if (doc["agent"] === undefined && doc["apis"] === undefined && doc["web"] === undefined)
        throw new PoppyProtocolError("poppy.json must list at least one of agent, apis, or web");
    const logoUri = organization["logo_uri"] === undefined
        ? undefined
        : httpsUrl(organization["logo_uri"], "organization.logo_uri").href;
    const auth = isObject(doc["auth"]) ? doc["auth"] : {};
    const disabled = auth["disabled"] === true;
    const authIssuer = auth["issuer"] === undefined ? undefined : string(auth["issuer"], "auth.issuer");
    const issuer = await findIssuer(fetchFn, domain, authIssuer, allowPrivate);
    const oauth = issuer === undefined
        ? undefined
        : await fetchOAuthServer(fetchFn, issuer, domain, allowPrivate);
    const conversationProtocols = parseProtocols(doc["agent"]);
    if (oauth === undefined && conversationProtocols.some((p) => p.access === "signed_in"))
        throw new PoppyProtocolError("a signed_in conversation protocol needs an issuer");
    const apis = parseApis(doc["apis"]);
    const extensions = parseExtensions(doc["extensions"]);
    const mediated = !disabled &&
        oauth?.grantTypesSupported.some((grant) => grant === MEDIATED_SIGN_IN_GRANT) === true
        ? parseMediated(extensions["mediated-sign-in"])
        : undefined;
    const browserSessionEndpoint = optionalUrl(doc["web"], "browser_session_endpoint", "web.browser_session_endpoint");
    const feedbackEndpoint = optionalUrl(doc["feedback"], "endpoint", "feedback.endpoint");
    const excludedTasksUrl = optionalUrl(doc["excluded_tasks"], "url", "excluded_tasks.url");
    const extensionEndpoints = Object.entries(extensions).flatMap(([name, entry]) => typeof entry["endpoint"] === "string"
        ? [httpsUrl(entry["endpoint"], `extensions.${name}.endpoint`).href]
        : []);
    const endpoints = [
        ...apis.map((api) => api.url),
        ...conversationProtocols.map((protocol) => protocol.endpoint),
        browserSessionEndpoint,
        feedbackEndpoint,
        ...extensionEndpoints,
    ].filter((url) => url !== undefined);
    for (const url of [
        ...endpoints,
        logoUri,
        excludedTasksUrl,
        oauth?.tokenEndpoint,
        oauth?.revocationEndpoint,
        oauth?.authorizationEndpoint,
        oauth?.deviceAuthorizationEndpoint,
    ]) {
        if (url !== undefined)
            checkPublicHost(new URL(url), "Company URL", allowPrivate);
    }
    return {
        protocolVersion: version,
        domain,
        name: typeof organization["name"] === "string" ? organization["name"] : domain,
        logoUri,
        identifier: issuer ?? originOf(domain),
        oauth,
        signIn: {
            disabled,
            direct: !disabled && oauth?.authorizationEndpoint !== undefined,
            device: !disabled && oauth?.deviceAuthorizationEndpoint !== undefined,
            mediated,
        },
        scopes: parseScopes(auth["scopes"]),
        scopeHints: parseScopeHints(auth["scope_hints"]),
        conversationProtocols,
        apis,
        browserSessionEndpoint,
        feedbackEndpoint,
        excludedTasksUrl,
        extensions,
        skills: parseSkillIndex(doc["skill_index"], finalUrl),
        ucp: parseUcp(extensions, doc["agent"], domain),
    };
}
/** Whether the Company lists `name` at `version` in its `extensions` (spec 3.3). */
export function companySupports(company, name, version) {
    return company.extensions[name]?.version === version;
}
//# sourceMappingURL=discovery.js.map