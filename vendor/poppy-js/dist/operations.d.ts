/** The extension name and version this client implements (Operations extension section 2). */
export declare const OPERATIONS_EXTENSION: {
    readonly name: "operations";
    readonly version: "2";
};
/** One action the Company performs once the User approves its exact terms (Operations section 3). */
export interface Operation {
    operationId: string;
    /** Identifies these terms. A new revision needs a new approval. */
    revision: string;
    /** The terms in plain language. Show it to the User with {@link renderSummary} or as text. */
    summary: string;
    /** The same terms as JSON, for checking against the `summary` and what you asked for. */
    terms: Readonly<Record<string, unknown>> | undefined;
    /** RFC 3339. The last time an approval of this revision is accepted. */
    expiresAt: string;
}
/** The User's approval of one revision (Operations section 6). */
export interface Approval {
    operationId: string;
    revision: string;
}
export declare function parseOperation(value: unknown): Operation;
/** The approval for an operation's current revision. Send it only after the User approves it (section 5). */
export declare function approvalFor(operation: Operation): Approval;
export declare function isOperationExpired(operation: Operation, now?: number): boolean;
/**
 * Reads the operation from an API response that refuses with `approval_required` (Operations section 4).
 * Reads a clone, so the response body stays readable. Returns undefined for any other response.
 */
export declare function operationFromResponse(response: Response): Promise<Operation | undefined>;
/** Reads the operation from an MCP tool error result (Operations section 4). */
export declare function operationFromToolResult(result: unknown): Operation | undefined;
/** The `Poppy-Approval` header value, an RFC 9651 Dictionary (Operations section 6). */
export declare function approvalHeader(approval: Approval): string;
/** The `_meta` member to add to the same `tools/call` to approve an MCP operation. */
export declare function approvalMeta(approval: Approval): Record<string, unknown>;
/** The `approval` field of a conversation message. */
export declare function approvalField(approval: Approval): Record<string, string>;
/**
 * Renders an operation `summary` as HTML with only what Operations section 3 allows: emphasis, strong
 * emphasis, paragraphs and lists. Links, images and HTML stay visible as text, so a summary can't send the
 * User elsewhere or load content while they decide.
 */
export declare function renderSummary(summary: string): string;
