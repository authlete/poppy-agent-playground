/**
 * Signs requests that carry the Session header with an HTTP Message Signature (RFC 9421) in the Web Bot
 * Auth profile, so a Company's bot defenses can recognize the operator (spec 5.3). The signature covers
 * `poppy-session`, and `authorization` when present. On a UCP request, it also covers the request target
 * and UCP's headers, so one signature serves both protocols (UCP extension 4). It is compatibility support:
 * it never replaces the Session JWT.
 */
export interface OperatorSignatureOptions {
    /** An Ed25519 private key. Publish its public key in your Web Bot Auth key directory. */
    privateKey: CryptoKey;
    /** The key's JWK thumbprint; see {@link operatorKeyId}. */
    keyId: string;
    /** URL of your key directory, sent in `Signature-Agent` and covered by the signature. */
    signatureAgent?: string;
    /** Seconds the signature is valid. Defaults to 60. */
    lifetime?: number;
}
/** The RFC 7638 thumbprint Web Bot Auth uses as `keyid`, from an Ed25519 public key. */
export declare function operatorKeyId(publicKey: CryptoKey): Promise<string>;
/** Adds `Signature-Input`, `Signature` and, if configured, `Signature-Agent` to `headers`. */
export declare function signOperator(options: OperatorSignatureOptions, url: URL, headers: Headers, method?: string): Promise<void>;
/**
 * Adds a signature to `Signature-Input` and `Signature`, beside any already there, such as a UCP request
 * signature (RFC 9421 section 4: both headers are Dictionaries). Takes the next free label after `label`.
 */
export declare function addSignature(headers: Headers, label: string, params: string, signature: ArrayBuffer | Uint8Array): string;
