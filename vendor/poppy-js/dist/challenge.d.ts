/** One challenge of a `WWW-Authenticate` header (RFC 9110 section 11.6.1). */
export interface AuthChallenge {
    /** Lowercased, such as `bearer` or `dpop`. */
    scheme: string;
    /** `error`, if any: `invalid_token`, `insufficient_scope`, `extension_required` (spec 7). */
    error: string | undefined;
    /** Space-separated scopes the request needs (RFC 6750 section 3.1). */
    scope: string | undefined;
    /** The resource's protected resource metadata URL (RFC 9728 section 5.1). */
    resourceMetadata: string | undefined;
    /** The extension the request needs, on `extension_required` (spec 3.3). */
    extension: string | undefined;
    params: Readonly<Record<string, string>>;
}
/** Parses every challenge in a `WWW-Authenticate` header, including several schemes in one header. */
export declare function parseChallenges(header: string | null): AuthChallenge[];
/** The first challenge with an `error`, or else the first challenge, of a response. */
export declare function authChallenge(response: Response): AuthChallenge | undefined;
/**
 * What a response says about account access (spec 7, 8.11): the scopes the request needs when it has no
 * access token (HTTP 401 with no error) or lacks scopes (`insufficient_scope`), else undefined.
 */
export declare function scopesNeeded(response: Response): string | undefined;
