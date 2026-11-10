import { API, MCP } from "./company.js";
const WEBSITE = "https://www.shop.test";
const discover = { action: "discover", website: WEBSITE };
const orders = { action: "request", url: `${API}/orders` };
/** A discovery the agent must refuse: after it, nothing may reach the Company's APIs. */
function refusal(name, check, company, description) {
    return {
        name,
        description,
        suite: "core",
        company,
        steps: [discover, orders],
        evaluate(c) {
            if (c.resourceRequests() > 0)
                c.fail(check, "used a Company it should have refused");
            else
                c.pass(check);
        },
    };
}
export const SCENARIOS = [
    refusal("discovery-well-known-path", "discovery.well-known-path", { redirectToUpload: true }, "www redirects poppy.json to an uploaded file."),
    refusal("discovery-domain", "discovery.domain", { wrongDomain: true }, "organization.domain names another host."),
    refusal("discovery-version", "discovery.version", { futureVersion: true }, "poppy.json declares a protocol version this draft doesn't define."),
    refusal("discovery-issuer-link", "discovery.issuer-link", { issuerUnlinked: true }, "The issuer's protected_resources leaves out the domain."),
    refusal("discovery-no-fallback", "discovery.no-fallback", { resourceMetadataFails: true }, "The domain's protected resource metadata fails with HTTP 500."),
    {
        name: "discovery-private-address",
        description: "poppy.json lists an API on a loopback address.",
        suite: "core",
        company: { privateApi: true },
        steps: [discover, { action: "request", url: "https://127.0.0.1/orders" }],
        evaluate(c) {
            if (c.offsite().some((r) => r.url.hostname === "127.0.0.1"))
                c.fail("discovery.private-address", "connected to a loopback address the Company named");
            else
                c.pass("discovery.private-address");
        },
    },
    {
        name: "signed-out",
        description: "Signed-out requests, a redirecting API, and a conversation.",
        suite: "interactions",
        company: {},
        steps: [
            discover,
            orders,
            { action: "request", url: `${API}/redirect` },
            { action: "converse", text: "Do you have the jacket in medium?" },
        ],
        evaluate(c) {
            if (c.offsite().some((r) => r.headers.has("poppy-session") || r.headers.has("authorization")))
                c.fail("http.redirects", "followed a redirect with credentials");
            else if (c.requests.some((r) => r.url.pathname === "/api/redirect"))
                c.pass("http.redirects");
        },
    },
    {
        name: "session-ended-once",
        description: "The API answers session_ended to the first request of each Session.",
        suite: "core",
        company: { sessionEnded: "once" },
        steps: [discover, orders],
        evaluate: (c) => c.checkSessionErrors(`${API}/orders`),
    },
    {
        name: "session-ended-always",
        description: "The API answers session_ended to every request.",
        suite: "core",
        company: { sessionEnded: "always" },
        steps: [discover, orders],
        evaluate: (c) => c.checkSessionErrors(`${API}/orders`),
    },
    {
        name: "invalid-session",
        description: "The API answers invalid_session to every request.",
        suite: "core",
        company: { invalidSession: true },
        steps: [discover, orders],
        evaluate: (c) => c.checkSessionErrors(`${API}/orders`),
    },
    {
        name: "unlisted-url",
        description: "Requests to a page on the Company's domain and a path on the API's host that no API describes.",
        suite: "core",
        company: {},
        steps: [
            discover,
            { action: "request", url: "https://shop.test/account" },
            { action: "request", url: "https://shop.test/admin/orders" },
            orders,
        ],
        evaluate(c) {
            const unlisted = c.requests.filter((r) => (r.url.pathname === "/account" || r.url.pathname.startsWith("/admin/")) &&
                r.headers.has("poppy-session"));
            if (unlisted.length > 0)
                c.fail("session.destinations", `sent the Session header to ${unlisted.map((r) => r.url.pathname).join(", ")}`);
            else if (c.resourceRequests() > 0)
                c.pass("session.destinations");
        },
    },
    {
        name: "sign-in",
        description: "Direct Sign-In, a refresh with rotation, an MCP resource token, an operation, and sign-out.",
        suite: "oauth",
        company: { rotate: true, expireTokensOnce: true },
        steps: [
            discover,
            { action: "sign_in", scopes: ["orders:read", "orders:write"] },
            orders,
            orders,
            {
                action: "request",
                url: MCP,
                method: "POST",
                body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
            },
            {
                action: "request_with_approval",
                url: `${API}/exchanges`,
                method: "POST",
                body: '{"item":"itm_1"}',
            },
            { action: "sign_out" },
        ],
    },
    {
        name: "sign-in-wrong-iss",
        description: "The authorization response names another issuer in iss.",
        suite: "oauth",
        company: { wrongIss: true },
        steps: [discover, { action: "sign_in", scopes: ["orders:read"] }, orders],
        evaluate(c) {
            if (!c.results().has("oauth.iss-check") && c.authorizeRequests() > 0)
                c.pass("oauth.iss-check");
        },
    },
    {
        name: "sign-in-extra-scope",
        description: "Sign-in grants a scope the agent didn't ask for.",
        suite: "oauth",
        company: { extraScope: true },
        steps: [discover, { action: "sign_in", scopes: ["orders:read"] }, orders],
        evaluate(c) {
            if (!c.results().has("oauth.extra-scopes") && c.authorizeRequests() > 0)
                c.pass("oauth.extra-scopes");
        },
    },
    {
        name: "sign-in-dpop",
        description: "The issuer advertises DPoP and binds tokens to the proof's key.",
        suite: "oauth",
        company: { dpop: true },
        steps: [discover, { action: "sign_in", scopes: ["orders:read"] }, orders],
    },
];
export function scenarioByName(name) {
    const scenario = SCENARIOS.find((candidate) => candidate.name === name);
    if (scenario === undefined)
        throw new Error(`unknown scenario ${name}`);
    return scenario;
}
//# sourceMappingURL=scenarios.js.map