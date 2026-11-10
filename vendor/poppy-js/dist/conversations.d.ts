import { type Approval, type Operation } from "./operations.ts";
import { type Session } from "./session.ts";
/** `idle`, `queued` and `closed`, or `working`, which unknown values also read as (spec 8.7). */
export type ConversationStatus = "working" | "idle" | "queued" | "closed";
/** `agent`, or `human`, which unknown values also read as (spec 8.7). */
export type Responder = "agent" | "human";
/** Who wrote a message (spec 8.4, 8.8). */
export interface Author {
    /** `human` only for the User's own words; summaries and translations are `agent` (spec 8.8). */
    type: "agent" | "human";
    /** Company messages only: a stable ID, a display name and a picture URL. Content from the Company. */
    id?: string;
    name?: string;
    image?: string;
}
/** Facts about the User's situation (spec 8.4). Fields left out keep their previous values. */
export interface MessageContext {
    /** RFC 5646 language tag, such as `en-US`. */
    locale?: string;
    /** IANA time zone name, such as `America/Los_Angeles`. */
    time_zone?: string;
    /** Whether the User can answer questions right now. */
    user_available?: boolean;
    [field: string]: unknown;
}
/** A web page a Company message refers to (Links extension section 3). Content from the Company. */
export interface MessageLink {
    /** HTTPS. A title can name a page other than the one at its URL, so show the URL's domain too. */
    url: string;
    title: string | undefined;
}
/** A notice the Company marked apart from the rest of a message (Disclosures extension section 3). */
export interface Disclosure {
    text: string;
}
/** A message the agent sends. Needs at least one of `text`, `data`, `context` or `approval`. */
export interface OutgoingMessage {
    /** Unique for the User; reuse it to retry the same message (spec 8.3). Generated when left out. */
    id?: string;
    /** Defaults to `{ type: "agent" }`. */
    author?: {
        type: "agent" | "human";
    };
    text?: string;
    data?: Record<string, unknown>;
    context?: MessageContext;
    /**
     * The User's approval of an operation, sent in `extensions.operations` (Operations extension section 6).
     * Only to a Company that lists the Operations extension, version 2.
     */
    approval?: Approval;
}
/** A message from either side, as the Company recorded it (spec 8.4). */
export interface ConversationMessage {
    id: string;
    /** `user` or `company`, the side it came from. */
    role: string;
    author: Author;
    text: string | undefined;
    data: Readonly<Record<string, unknown>> | undefined;
    context: Readonly<Record<string, unknown>> | undefined;
    /** Content defined by extensions, keyed by extension name, as sent (spec 8.4). */
    extensions: Readonly<Record<string, unknown>> | undefined;
    /** An operation awaiting the User's approval, from `extensions.operations` (Operations section 4). */
    operation: Operation | undefined;
    /** Links from `extensions.links` (Links extension). Empty when there are none. */
    links: readonly MessageLink[];
    /** Disclosures from `extensions.disclosures` (Disclosures extension). Empty when there are none. */
    disclosures: readonly Disclosure[];
}
interface EventBase {
    id: string;
    /** RFC 3339. */
    createdAt: string;
}
/** An event in a conversation (spec 8.5). Events of unknown types are skipped. */
export type ConversationEvent = (EventBase & {
    type: "message";
    message: ConversationMessage;
}) | (EventBase & {
    type: "state";
    status: ConversationStatus;
    responder: Responder;
}) | (EventBase & {
    type: "authorization";
    error: string;
    scope: string;
}) | (EventBase & {
    type: "user_requested";
    reason: string;
}) | (EventBase & {
    type: "direct_opened" | "direct_closed";
    conversationId: string;
});
/** What a request returned: new events, deduplicated, and the conversation's state after them. */
export interface ConversationUpdate {
    events: ConversationEvent[];
    status: ConversationStatus;
    responder: Responder;
    /** When true, read again right away (spec 8.5). */
    hasMore: boolean;
}
/** An item from {@link Conversation.stream}. */
export type StreamItem = {
    type: "event";
    event: ConversationEvent;
}
/** A piece of a message the Company Agent is still writing (spec 8.6). Replace with the `message` event. */
 | {
    type: "text-delta";
    messageId: string;
    text: string;
}
/** The stream reconnected: drop pieces of messages not yet received in full (spec 8.6). */
 | {
    type: "reconnected";
};
/** Parses one event, or undefined for an unknown or malformed type, which the agent skips (spec 8.5). */
export declare function parseEvent(value: unknown): ConversationEvent | undefined;
/** The conversations at one `poppy` endpoint, in one Session (spec 8). */
export declare class Conversations {
    #private;
    readonly session: Session;
    readonly endpoint: string;
    constructor(session: Session, endpoint: string);
    /**
     * Starts a conversation with its first message (spec 8.3). With `wait`, the response also carries the
     * Company's first events, held for up to that many seconds.
     */
    start(message: OutgoingMessage, options?: {
        wait?: number;
    }): Promise<{
        conversation: Conversation;
        update: ConversationUpdate;
    }>;
    /**
     * Opens a Direct Conversation (spec 8.10), linked to an open conversation, for the User to talk with the
     * Company themselves. Messages default to `author.type` `human`. Start one only when the User agrees.
     *
     * To accept a `user_requested` event, pass its ID as `userRequestedEventId`. The message is then
     * optional: without one, the Company speaks first. Retrying the acceptance returns the same conversation.
     */
    openDirect(parentConversationId: string, message: OutgoingMessage | undefined, options?: {
        wait?: number;
        userRequestedEventId?: string;
    }): Promise<{
        conversation: Conversation;
        update: ConversationUpdate;
    }>;
    /**
     * Resumes a conversation in this Session. Pass the `cursor` and `handledEventIds` you saved, so a read
     * from the start after `cursor_expired` skips events already handled (spec 8.5).
     */
    resume(conversationId: string, options?: {
        cursor?: string;
        direct?: boolean;
        handledEventIds?: Iterable<string>;
    }): Conversation;
    /** Sends a JSON request and returns the JSON body, throwing {@link PoppyError} on an error status. */
    request(method: string, url: string, body: Record<string, unknown> | undefined, headers?: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>>;
}
/** One conversation with the Company Agent (spec 8). Keeps its cursor and skips events already handled. */
export declare class Conversation {
    #private;
    readonly id: string;
    /** Whether this is a Direct Conversation (spec 8.10). */
    readonly direct: boolean;
    constructor(conversations: Conversations, id: string, cursor: string | undefined, direct: boolean);
    get status(): ConversationStatus;
    get responder(): Responder;
    /** The cursor after the last event handled. Save it to resume later (spec 8.5). */
    get cursor(): string | undefined;
    /** The IDs of events already handled. Save them with the cursor to resume without repeats. */
    get handledEventIds(): string[];
    /** Marks an event as handled, so reads skip it. */
    markHandled(eventId: string): void;
    /** Applies a response: handles new events in order and saves the cursor after them (spec 8.5). */
    apply(response: Record<string, unknown>): ConversationUpdate;
    /**
     * Sends a message (spec 8.3). With `wait`, the response carries the Company's events after the cursor.
     * To retry after a failure, send the same message again with the same `id`.
     */
    send(message: OutgoingMessage, options?: {
        wait?: number;
    }): Promise<ConversationUpdate>;
    /**
     * Reads one page of events after the cursor (spec 8.5), holding up to `wait` seconds for one. On
     * `cursor_expired`, reads from the beginning and skips events already handled.
     */
    read(options?: {
        wait?: number;
        signal?: AbortSignal;
    }): Promise<ConversationUpdate>;
    /** Reads until `has_more` is false. */
    readAll(options?: {
        wait?: number;
    }): Promise<ConversationUpdate>;
    /** Asks for a person at the Company (spec 8.9). */
    handoff(): Promise<{
        status: ConversationStatus;
        responder: Responder;
    }>;
    /** Closes the conversation (spec 8.12). Doesn't cancel anything it started. */
    close(): Promise<{
        status: ConversationStatus;
        responder: Responder;
    }>;
    /**
     * Opens a Direct Conversation linked to this one (spec 8.10). Pass `userRequestedEventId` to accept a
     * `user_requested` event, with or without a first message.
     */
    openDirect(message: OutgoingMessage | undefined, options?: {
        wait?: number;
        userRequestedEventId?: string;
    }): Promise<{
        conversation: Conversation;
        update: ConversationUpdate;
    }>;
    /**
     * Streams events (spec 8.6), reconnecting with `Last-Event-ID` when the Company closes the stream, until
     * the conversation is closed or `signal` aborts. Falls back to long-polling a Company that doesn't stream.
     */
    stream(options?: {
        signal?: AbortSignal;
    }): AsyncGenerator<StreamItem>;
}
export {};
