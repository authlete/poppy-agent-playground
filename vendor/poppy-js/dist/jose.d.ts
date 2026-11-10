export declare function base64url(bytes: ArrayBuffer | Uint8Array): string;
/** 128 random bits, base64url: unguessable, and only characters IDs may use (spec 8.2). */
export declare function randomId(prefix?: string): string;
export declare function sha256(value: string): Promise<string>;
export declare function nowSeconds(): number;
export declare const ES256: EcKeyImportParams & EcdsaParams;
/** `alg` values Companies accept for client assertions and delegations (spec 4.1, 5.2). */
export type SigningAlgorithm = "ES256" | "PS384";
/**
 * Signs client assertions and delegations with a key from the agent's `jwks_uri` (spec 4.1, 5.2).
 * Implement it yourself to keep the key in an HSM or KMS, or to have it sign blindly with RFC 9474
 * RSABSSA-SHA384-PSS-Deterministic, which yields `PS384` signatures (spec 10.7).
 */
export interface Signer {
    /** The key's `kid` in the published key set. */
    readonly kid: string;
    readonly alg: SigningAlgorithm;
    /** Returns the JWS signature over `input`: raw `r || s` for ES256, the PSS signature for PS384. */
    sign(input: Uint8Array<ArrayBuffer>): Promise<Uint8Array>;
}
/** A WebCrypto private key from the agent's key set: ECDSA P-256 (ES256) or RSA-PSS SHA-384 (PS384). */
export interface SigningKey {
    privateKey: CryptoKey;
    /** Must match this key's `kid` in the published key set. */
    kid: string;
}
export declare function signerFromKey({ privateKey, kid }: SigningKey): Signer;
export declare function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, signer: Pick<Signer, "alg" | "sign">): Promise<string>;
/** An ES256 signer for a private key that never leaves this process. */
export declare function es256Signer(privateKey: CryptoKey): Pick<Signer, "alg" | "sign">;
export interface EcPublicJwk {
    kty: "EC";
    crv: "P-256";
    x: string;
    y: string;
}
export declare function ecPublicJwk(key: CryptoKey): Promise<EcPublicJwk>;
/** RFC 7638 thumbprint of an EC or RSA public key: required members only, in lexicographic order. */
export declare function thumbprint(jwk: JsonWebKey): Promise<string>;
/** Reads a JWT's header and payload without verifying it. */
export declare function decodeJwt(jwt: string): {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
};
