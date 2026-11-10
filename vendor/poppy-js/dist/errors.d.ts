/** Codes a Company may return (spec 4, 5.3, 7, 8.13, extensions). Other strings can occur. */
export type PoppyErrorCode = "invalid_request" | "invalid_client" | "invalid_grant" | "invalid_scope" | "invalid_target" | "unsupported_grant_type" | "invalid_session" | "session_ended" | "unauthorized_client" | "invalid_token" | "insufficient_scope" | "invalid_dpop_proof" | "use_dpop_nonce" | "extension_required" | "rate_limited" | "authorization_pending" | "slow_down" | "access_denied" | "expired_token" | "code_required" | "approval_required" | "conversation_not_found" | "conversation_closed" | "direct_conversation_open" | "message_id_conflict" | "invalid_cursor" | "cursor_expired" | "protocol_error" | (string & {});
export interface PoppyErrorOptions {
    status?: number | undefined;
    description?: string | undefined;
    retryAfter?: number | undefined;
    extension?: string | undefined;
    conversationId?: string | undefined;
    scope?: string | undefined;
}
/**
 * An error returned by a Company, or a failed protocol check.
 * Holds only the HTTP status, `error`, `error_description` and a few named fields, never tokens,
 * assertions, Session JWTs, device codes, credentials or response bodies, so it is safe to log (spec 10.2).
 */
export declare class PoppyError extends Error {
    readonly name: string;
    readonly error: PoppyErrorCode;
    readonly status: number | undefined;
    readonly errorDescription: string | undefined;
    /** Seconds to wait before retrying, from `Retry-After` on HTTP 429 or 503 (spec 5.6). */
    readonly retryAfter: number | undefined;
    /** The extension a Company requires, on `extension_required` (spec 3.3). */
    readonly extension: string | undefined;
    /** The open Direct Conversation, on `direct_conversation_open` (spec 8.10). */
    readonly conversationId: string | undefined;
    /** The scopes a request needs, on `insufficient_scope` (spec 7). */
    readonly scope: string | undefined;
    constructor(error: PoppyErrorCode, options?: PoppyErrorOptions);
}
/** Raised when a document or response breaks the protocol. Has no `status`. */
export declare class PoppyProtocolError extends PoppyError {
    readonly name = "PoppyProtocolError";
    constructor(description: string);
}
export declare function parseRetryAfter(value: string | null): number | undefined;
/**
 * The JSON body of each error, for this package's own use, such as reading `sign_in_id` on
 * `code_required`. Kept off the error object so logging an error never logs a body.
 */
export declare const errorBodies: WeakMap<PoppyError, Record<string, unknown>>;
/** Builds an error from a JSON error body (RFC 6749 section 5.2), keeping only safe fields. */
export declare function errorFromBody(body: unknown, response: Response): PoppyError;
export declare function errorFromResponse(response: Response): Promise<PoppyError>;
