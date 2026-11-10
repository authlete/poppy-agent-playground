import { ES256, ecPublicJwk, es256Signer, nowSeconds, randomId, sha256, signJwt } from "./jose.js";
/** A DPoP key (RFC 9449), used when a Company binds its access tokens (spec 4.5). */
export class DpopKey {
    #privateKey;
    #jwk;
    constructor(privateKey, jwk) {
        this.#privateKey = privateKey;
        this.#jwk = jwk;
    }
    static async generate() {
        const pair = await crypto.subtle.generateKey(ES256, true, ["sign", "verify"]);
        const exported = await crypto.subtle.exportKey("jwk", pair.privateKey);
        return { key: new DpopKey(pair.privateKey, await ecPublicJwk(pair.publicKey)), exported };
    }
    static async fromJwk(jwk) {
        const privateKey = await crypto.subtle.importKey("jwk", jwk, ES256, false, ["sign"]);
        const { kty, crv, x, y } = jwk;
        return new DpopKey(privateKey, { kty, crv, x, y });
    }
    /** `htu` drops the query and fragment (RFC 9449 section 4.2). */
    async proof(method, url, options = {}) {
        const target = new URL(url);
        const payload = {
            jti: randomId(),
            htm: method.toUpperCase(),
            htu: `${target.origin}${target.pathname}`,
            iat: nowSeconds(),
        };
        if (options.accessToken !== undefined)
            payload["ath"] = await sha256(options.accessToken);
        if (options.nonce !== undefined)
            payload["nonce"] = options.nonce;
        return signJwt({ typ: "dpop+jwt", jwk: this.#jwk }, payload, es256Signer(this.#privateKey));
    }
}
//# sourceMappingURL=dpop.js.map