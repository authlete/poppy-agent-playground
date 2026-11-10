import { PoppyProtocolError } from "./errors.js";
import { httpsUrl } from "./http.js";
function sameHost(clientId, value, what) {
    const url = httpsUrl(value, what);
    if (url.hostname !== clientId.hostname)
        throw new PoppyProtocolError(`${what} must be on ${clientId.hostname}`);
    return url.href;
}
/** RFC 8252 section 7.3: `http` to an IP loopback literal. Any port is allowed when used. */
export function isLoopbackRedirect(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return false;
    }
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}
/**
 * Builds the client metadata document. Serve the result as JSON at exactly `clientId` (spec 4.1), without
 * redirects.
 */
export function clientMetadata(input) {
    const clientId = httpsUrl(input.clientId, "clientId");
    if (clientId.href !== input.clientId)
        throw new PoppyProtocolError("clientId must be a normalized URL");
    const redirectUris = (input.redirectUris ?? []).map((uri, index) => isLoopbackRedirect(uri) ? uri : sameHost(clientId, uri, `redirectUris[${index}]`));
    return {
        client_id: input.clientId,
        client_name: input.clientName,
        ...(input.logoUri === undefined ? {} : { logo_uri: httpsUrl(input.logoUri, "logoUri").href }),
        jwks_uri: sameHost(clientId, input.jwksUri, "jwksUri"),
        ...(redirectUris.length === 0 ? {} : { redirect_uris: redirectUris }),
        token_endpoint_auth_method: "private_key_jwt",
        ...(input.extensions === undefined || Object.keys(input.extensions).length === 0
            ? {}
            : { extensions: input.extensions }),
    };
}
/**
 * Builds the key set to serve at `jwks_uri`. Takes ECDSA P-256 keys (ES256) and RSA-PSS keys (PS384).
 * Only public members are included (spec 4.1).
 */
export async function jwks(keys) {
    return {
        keys: await Promise.all(keys.map(async ({ publicKey, kid }) => {
            const jwk = await crypto.subtle.exportKey("jwk", publicKey);
            if (jwk.kty === "EC") {
                return {
                    kty: "EC",
                    crv: jwk.crv,
                    x: jwk.x,
                    y: jwk.y,
                    kid,
                    alg: "ES256",
                    use: "sig",
                };
            }
            if (jwk.kty === "RSA") {
                return { kty: "RSA", n: jwk.n, e: jwk.e, kid, alg: "PS384", use: "sig" };
            }
            throw new TypeError(`unsupported key type ${String(jwk.kty)}`);
        })),
    };
}
//# sourceMappingURL=metadata.js.map