const encoder = new TextEncoder();
const decoder = new TextDecoder();
export function base64url(bytes) {
    return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
}
/** 128 random bits, base64url: unguessable, and only characters IDs may use (spec 8.2). */
export function randomId(prefix = "") {
    return `${prefix}${base64url(crypto.getRandomValues(new Uint8Array(16)))}`;
}
export async function sha256(value) {
    return base64url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}
export const ES256 = {
    name: "ECDSA",
    namedCurve: "P-256",
    hash: "SHA-256",
};
export function signerFromKey({ privateKey, kid }) {
    const name = privateKey.algorithm.name;
    if (name === "ECDSA" && privateKey.algorithm.namedCurve === "P-256") {
        return {
            kid,
            alg: "ES256",
            sign: async (input) => new Uint8Array(await crypto.subtle.sign(ES256, privateKey, input)),
        };
    }
    if (name === "RSA-PSS" &&
        privateKey.algorithm.hash.name === "SHA-384") {
        return {
            kid,
            alg: "PS384",
            // PS384 uses a salt as long as the hash (RFC 7518 section 3.5).
            sign: async (input) => new Uint8Array(await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 48 }, privateKey, input)),
        };
    }
    throw new TypeError(`signing key must be ECDSA P-256 or RSA-PSS SHA-384, not ${name}`);
}
function encodePart(value) {
    return base64url(encoder.encode(JSON.stringify(value)));
}
export async function signJwt(header, payload, signer) {
    const input = `${encodePart({ ...header, alg: signer.alg })}.${encodePart(payload)}`;
    return `${input}.${base64url(await signer.sign(encoder.encode(input)))}`;
}
/** An ES256 signer for a private key that never leaves this process. */
export function es256Signer(privateKey) {
    return {
        alg: "ES256",
        sign: async (input) => new Uint8Array(await crypto.subtle.sign(ES256, privateKey, input)),
    };
}
export async function ecPublicJwk(key) {
    const { x, y } = await crypto.subtle.exportKey("jwk", key);
    if (x === undefined || y === undefined)
        throw new TypeError("not an EC public key");
    return { kty: "EC", crv: "P-256", x, y };
}
/** RFC 7638 thumbprint of an EC or RSA public key: required members only, in lexicographic order. */
export async function thumbprint(jwk) {
    const members = jwk.kty === "EC"
        ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
        : jwk.kty === "RSA"
            ? { e: jwk.e, kty: jwk.kty, n: jwk.n }
            : jwk.kty === "OKP"
                ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x }
                : undefined;
    if (members === undefined)
        throw new TypeError(`unsupported key type ${String(jwk.kty)}`);
    return sha256(JSON.stringify(members));
}
/** Reads a JWT's header and payload without verifying it. */
export function decodeJwt(jwt) {
    const [header, payload] = jwt.split(".");
    if (header === undefined || payload === undefined)
        throw new TypeError("not a JWT");
    return {
        header: JSON.parse(decoder.decode(Buffer.from(header, "base64url"))),
        payload: JSON.parse(decoder.decode(Buffer.from(payload, "base64url"))),
    };
}
//# sourceMappingURL=jose.js.map