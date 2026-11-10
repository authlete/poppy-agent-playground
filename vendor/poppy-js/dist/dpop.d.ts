/** A DPoP key (RFC 9449), used when a Company binds its access tokens (spec 4.5). */
export declare class DpopKey {
    #private;
    private constructor();
    static generate(): Promise<{
        key: DpopKey;
        exported: JsonWebKey;
    }>;
    static fromJwk(jwk: JsonWebKey): Promise<DpopKey>;
    /** `htu` drops the query and fragment (RFC 9449 section 4.2). */
    proof(method: string, url: string, options?: {
        accessToken?: string | undefined;
        nonce?: string | undefined;
    }): Promise<string>;
}
