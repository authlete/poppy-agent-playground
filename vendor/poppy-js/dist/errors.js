/**
 * An error returned by a Company, or a failed protocol check.
 * Holds only the HTTP status, `error`, `error_description` and a few named fields, never tokens,
 * assertions, Session JWTs, device codes, credentials or response bodies, so it is safe to log (spec 10.2).
 */
export class PoppyError extends Error {
    name = "PoppyError";
    error;
    status;
    errorDescription;
    /** Seconds to wait before retrying, from `Retry-After` on HTTP 429 or 503 (spec 5.6). */
    retryAfter;
    /** The extension a Company requires, on `extension_required` (spec 3.3). */
    extension;
    /** The open Direct Conversation, on `direct_conversation_open` (spec 8.10). */
    conversationId;
    /** The scopes a request needs, on `insufficient_scope` (spec 7). */
    scope;
    constructor(error, options = {}) {
        super(options.description ? `${error}: ${options.description}` : error);
        this.error = error;
        this.status = options.status;
        this.errorDescription = options.description;
        this.retryAfter = options.retryAfter;
        this.extension = options.extension;
        this.conversationId = options.conversationId;
        this.scope = options.scope;
    }
}
/** Raised when a document or response breaks the protocol. Has no `status`. */
export class PoppyProtocolError extends PoppyError {
    name = "PoppyProtocolError";
    constructor(description) {
        super("protocol_error", { description });
    }
}
const MAX_FIELD = 200;
export function parseRetryAfter(value) {
    if (value === null)
        return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0)
        return seconds;
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
function stringField(body, key) {
    if (typeof body !== "object" || body === null)
        return undefined;
    const value = body[key];
    return typeof value === "string" ? value.slice(0, MAX_FIELD) : undefined;
}
/**
 * The JSON body of each error, for this package's own use, such as reading `sign_in_id` on
 * `code_required`. Kept off the error object so logging an error never logs a body.
 */
export const errorBodies = new WeakMap();
/** Builds an error from a JSON error body (RFC 6749 section 5.2), keeping only safe fields. */
export function errorFromBody(body, response) {
    const code = stringField(body, "error") ??
        (response.status === 429 ? "rate_limited" : `http_${response.status}`);
    const error = new PoppyError(code, {
        status: response.status,
        description: stringField(body, "error_description"),
        retryAfter: parseRetryAfter(response.headers.get("retry-after")),
        extension: stringField(body, "extension"),
        conversationId: stringField(body, "conversation_id"),
        scope: stringField(body, "scope"),
    });
    if (typeof body === "object" && body !== null && !Array.isArray(body))
        errorBodies.set(error, body);
    return error;
}
export async function errorFromResponse(response) {
    let body;
    try {
        body = await response.json();
    }
    catch {
        body = undefined;
    }
    return errorFromBody(body, response);
}
//# sourceMappingURL=errors.js.map