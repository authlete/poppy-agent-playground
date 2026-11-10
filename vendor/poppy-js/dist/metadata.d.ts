export interface ClientMetadataInput {
    /** The HTTPS URL this document is served from. */
    clientId: string;
    clientName: string;
    /** HTTPS URL of the key set from {@link jwks}, on the same host as `clientId`. */
    jwksUri: string;
    logoUri?: string;
    /**
     * Where Direct Sign-In may return the User (spec 4.2): HTTPS URLs on the same host as `clientId`, or
     * loopback redirect URIs for an app on the User's computer (RFC 8252 section 7.3).
     */
    redirectUris?: readonly string[];
    /** Extensions this agent supports, by name (spec 3.3), such as `{ operations: { version: "2" } }`. */
    extensions?: Readonly<Record<string, {
        version: string;
    }>>;
}
/** RFC 8252 section 7.3: `http` to an IP loopback literal. Any port is allowed when used. */
export declare function isLoopbackRedirect(value: string): boolean;
/**
 * Builds the client metadata document. Serve the result as JSON at exactly `clientId` (spec 4.1), without
 * redirects.
 */
export declare function clientMetadata(input: ClientMetadataInput): Record<string, unknown>;
/**
 * Builds the key set to serve at `jwks_uri`. Takes ECDSA P-256 keys (ES256) and RSA-PSS keys (PS384).
 * Only public members are included (spec 4.1).
 */
export declare function jwks(keys: {
    publicKey: CryptoKey;
    kid: string;
}[]): Promise<{
    keys: JsonWebKey[];
}>;
