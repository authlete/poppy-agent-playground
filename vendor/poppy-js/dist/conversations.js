import { companySupports } from "./discovery.js";
import { PoppyError, PoppyProtocolError, parseRetryAfter } from "./errors.js";
import { isObject, sleep } from "./http.js";
import { randomId } from "./jose.js";
import { approvalField, parseOperation } from "./operations.js";
import { throwable } from "./session.js";
const ID = /^[A-Za-z0-9_-]{1,256}$/;
/** How long a long-poll read asks the Company to hold the request, in seconds (spec 8.5). */
const POLL_WAIT = 30;
const RECONNECT_DELAY = 1000;
function normalizeStatus(value) {
    return value === "idle" || value === "queued" || value === "closed" ? value : "working";
}
function normalizeResponder(value) {
    return value === "agent" ? "agent" : "human";
}
function parseAuthor(value) {
    if (!isObject(value))
        return { type: "agent" };
    const author = { type: value["type"] === "human" ? "human" : "agent" };
    if (typeof value["id"] === "string")
        author.id = value["id"];
    if (typeof value["name"] === "string")
        author.name = value["name"];
    if (typeof value["image"] === "string")
        author.image = value["image"];
    return author;
}
function items(content) {
    return isObject(content) && Array.isArray(content["items"])
        ? content["items"].filter(isObject)
        : [];
}
function parseLinks(content) {
    return items(content).flatMap((item) => {
        const url = item["url"];
        if (typeof url !== "string" || !url.startsWith("https://") || !URL.canParse(url))
            return [];
        return [{ url, title: typeof item["title"] === "string" ? item["title"] : undefined }];
    });
}
function parseDisclosures(content) {
    return items(content).flatMap((item) => typeof item["text"] === "string" && item["text"] !== "" ? [{ text: item["text"] }] : []);
}
function parseMessage(value) {
    if (!isObject(value) || typeof value["id"] !== "string")
        return undefined;
    const extensions = isObject(value["extensions"]) ? value["extensions"] : undefined;
    const operations = extensions?.["operations"];
    let operation;
    if (isObject(operations) && operations["operation"] !== undefined) {
        try {
            operation = parseOperation(operations["operation"]);
        }
        catch {
            operation = undefined;
        }
    }
    return {
        id: value["id"],
        role: typeof value["role"] === "string" ? value["role"] : "company",
        author: parseAuthor(value["author"]),
        text: typeof value["text"] === "string" ? value["text"] : undefined,
        data: isObject(value["data"]) ? value["data"] : undefined,
        context: isObject(value["context"]) ? value["context"] : undefined,
        extensions,
        operation,
        links: parseLinks(extensions?.["links"]),
        disclosures: parseDisclosures(extensions?.["disclosures"]),
    };
}
/** Parses one event, or undefined for an unknown or malformed type, which the agent skips (spec 8.5). */
export function parseEvent(value) {
    if (!isObject(value) || typeof value["id"] !== "string")
        return undefined;
    const base = {
        id: value["id"],
        createdAt: typeof value["created_at"] === "string" ? value["created_at"] : "",
    };
    switch (value["type"]) {
        case "message": {
            const message = parseMessage(value["message"]);
            return message === undefined ? undefined : { ...base, type: "message", message };
        }
        case "state":
            return {
                ...base,
                type: "state",
                status: normalizeStatus(value["status"]),
                responder: normalizeResponder(value["responder"]),
            };
        case "authorization":
            return {
                ...base,
                type: "authorization",
                error: typeof value["error"] === "string" ? value["error"] : "insufficient_scope",
                scope: typeof value["scope"] === "string" ? value["scope"] : "",
            };
        case "user_requested":
            return {
                ...base,
                type: "user_requested",
                reason: typeof value["reason"] === "string" ? value["reason"] : "",
            };
        case "direct_opened":
        case "direct_closed":
            return typeof value["conversation_id"] === "string"
                ? { ...base, type: value["type"], conversationId: value["conversation_id"] }
                : undefined;
        default:
            return undefined;
    }
}
function messageBody(message, defaultAuthor, company) {
    const id = message.id ?? randomId("msg_");
    if (!ID.test(id))
        throw new PoppyProtocolError("message id must be 1 to 256 URL-safe base64 characters");
    if (message.text === undefined &&
        message.data === undefined &&
        message.context === undefined &&
        message.approval === undefined)
        throw new PoppyProtocolError("a message needs text, data, context or an approval");
    // A side sends an extension's content only to one that lists the same version (spec 8.4).
    if (message.approval !== undefined && !companySupports(company, "operations", "2"))
        throw new PoppyProtocolError(`${company.domain} doesn't list the Operations extension, version 2`);
    return {
        id,
        author: { type: message.author?.type ?? defaultAuthor },
        ...(message.text === undefined ? {} : { text: message.text }),
        ...(message.data === undefined ? {} : { data: message.data }),
        ...(message.context === undefined ? {} : { context: message.context }),
        ...(message.approval === undefined
            ? {}
            : { extensions: { operations: { approval: approvalField(message.approval) } } }),
    };
}
function withQuery(url, query) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(query))
        if (value !== undefined)
            target.searchParams.set(key, String(value));
    return target.href;
}
/** The conversations at one `poppy` endpoint, in one Session (spec 8). */
export class Conversations {
    session;
    endpoint;
    constructor(session, endpoint) {
        this.session = session;
        this.endpoint = endpoint.replace(/\/$/, "");
    }
    /**
     * Starts a conversation with its first message (spec 8.3). With `wait`, the response also carries the
     * Company's first events, held for up to that many seconds.
     */
    async start(message, options = {}) {
        return this.#create({ message: messageBody(message, "agent", this.session.company) }, options.wait, false);
    }
    /**
     * Opens a Direct Conversation (spec 8.10), linked to an open conversation, for the User to talk with the
     * Company themselves. Messages default to `author.type` `human`. Start one only when the User agrees.
     *
     * To accept a `user_requested` event, pass its ID as `userRequestedEventId`. The message is then
     * optional: without one, the Company speaks first. Retrying the acceptance returns the same conversation.
     */
    async openDirect(parentConversationId, message, options = {}) {
        const { userRequestedEventId } = options;
        if (message === undefined && userRequestedEventId === undefined)
            throw new PoppyProtocolError("a Direct Conversation starts with a message or an acceptance");
        if (userRequestedEventId !== undefined && !ID.test(userRequestedEventId))
            throw new PoppyProtocolError("malformed event ID");
        return this.#create({
            parent_conversation_id: parentConversationId,
            ...(userRequestedEventId === undefined
                ? {}
                : { user_requested_event_id: userRequestedEventId }),
            ...(message === undefined
                ? {}
                : { message: messageBody(message, "human", this.session.company) }),
        }, options.wait, true);
    }
    /**
     * Resumes a conversation in this Session. Pass the `cursor` and `handledEventIds` you saved, so a read
     * from the start after `cursor_expired` skips events already handled (spec 8.5).
     */
    resume(conversationId, options = {}) {
        if (!ID.test(conversationId))
            throw new PoppyProtocolError("malformed Conversation ID");
        const conversation = new Conversation(this, conversationId, options.cursor, options.direct ?? false);
        for (const id of options.handledEventIds ?? [])
            conversation.markHandled(id);
        return conversation;
    }
    async #create(body, wait, direct) {
        const response = await this.request("POST", withQuery(this.endpoint, { wait }), body);
        const id = response["conversation_id"];
        if (typeof id !== "string" || !ID.test(id))
            throw new PoppyProtocolError("the Company returned no valid conversation_id");
        const conversation = new Conversation(this, id, undefined, direct);
        return { conversation, update: conversation.apply(response) };
    }
    /** Sends a JSON request and returns the JSON body, throwing {@link PoppyError} on an error status. */
    async request(method, url, body, headers = {}, signal) {
        const response = await this.session.fetch(url, {
            method,
            ...(signal === undefined ? {} : { signal }),
            headers: {
                accept: "application/json",
                ...(body === undefined ? {} : { "content-type": "application/json" }),
                ...headers,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok)
            throw await throwable(response);
        const json = await response.json().catch(() => undefined);
        if (!isObject(json))
            throw new PoppyProtocolError("conversation response must be a JSON object");
        return json;
    }
}
/** One conversation with the Company Agent (spec 8). Keeps its cursor and skips events already handled. */
export class Conversation {
    id;
    /** Whether this is a Direct Conversation (spec 8.10). */
    direct;
    #conversations;
    #cursor;
    #status = "working";
    #responder = "agent";
    #seen = new Set();
    constructor(conversations, id, cursor, direct) {
        this.#conversations = conversations;
        this.id = id;
        this.#cursor = cursor;
        this.direct = direct;
    }
    get status() {
        return this.#status;
    }
    get responder() {
        return this.#responder;
    }
    /** The cursor after the last event handled. Save it to resume later (spec 8.5). */
    get cursor() {
        return this.#cursor;
    }
    /** The IDs of events already handled. Save them with the cursor to resume without repeats. */
    get handledEventIds() {
        return [...this.#seen];
    }
    /** Marks an event as handled, so reads skip it. */
    markHandled(eventId) {
        this.#seen.add(eventId);
    }
    get #url() {
        return `${this.#conversations.endpoint}/${this.id}`;
    }
    /** Applies a response: handles new events in order and saves the cursor after them (spec 8.5). */
    apply(response) {
        const events = [];
        if (Array.isArray(response["events"])) {
            for (const raw of response["events"]) {
                const id = isObject(raw) ? raw["id"] : undefined;
                if (typeof id !== "string")
                    continue;
                if (this.#seen.has(id))
                    continue;
                this.#seen.add(id);
                this.#cursor = id;
                const event = parseEvent(raw);
                if (event === undefined)
                    continue;
                if (event.type === "state") {
                    this.#status = event.status;
                    this.#responder = event.responder;
                }
                events.push(event);
            }
            if (typeof response["cursor"] === "string")
                this.#cursor = response["cursor"];
        }
        if (response["status"] !== undefined)
            this.#status = normalizeStatus(response["status"]);
        if (response["responder"] !== undefined)
            this.#responder = normalizeResponder(response["responder"]);
        return {
            events,
            status: this.#status,
            responder: this.#responder,
            hasMore: response["has_more"] === true,
        };
    }
    /**
     * Sends a message (spec 8.3). With `wait`, the response carries the Company's events after the cursor.
     * To retry after a failure, send the same message again with the same `id`.
     */
    async send(message, options = {}) {
        // In a Direct Conversation the User writes, so messages default to `human` (spec 8.10).
        const body = messageBody(message, this.direct ? "human" : "agent", this.#conversations.session.company);
        const url = withQuery(`${this.#url}/messages`, {
            wait: options.wait,
            cursor: options.wait === undefined ? undefined : this.#cursor,
        });
        return this.apply(await this.#conversations.request("POST", url, { message: body }));
    }
    /**
     * Reads one page of events after the cursor (spec 8.5), holding up to `wait` seconds for one. On
     * `cursor_expired`, reads from the beginning and skips events already handled.
     */
    async read(options = {}) {
        try {
            return this.apply(await this.#conversations.request("GET", withQuery(`${this.#url}/events`, { cursor: this.#cursor, wait: options.wait }), undefined, {}, options.signal));
        }
        catch (error) {
            if (!(error instanceof PoppyError) ||
                error.error !== "cursor_expired" ||
                this.#cursor === undefined)
                throw error;
            this.#cursor = undefined;
            return this.read(options);
        }
    }
    /** Reads until `has_more` is false. */
    async readAll(options = {}) {
        const events = [];
        for (;;) {
            const update = await this.read(events.length === 0 ? options : {});
            events.push(...update.events);
            if (!update.hasMore)
                return { ...update, events };
        }
    }
    /** Asks for a person at the Company (spec 8.9). */
    async handoff() {
        const update = this.apply(await this.#conversations.request("POST", `${this.#url}/handoff`, {}));
        return { status: update.status, responder: update.responder };
    }
    /** Closes the conversation (spec 8.12). Doesn't cancel anything it started. */
    async close() {
        const update = this.apply(await this.#conversations.request("POST", `${this.#url}/close`, {}));
        return { status: update.status, responder: update.responder };
    }
    /**
     * Opens a Direct Conversation linked to this one (spec 8.10). Pass `userRequestedEventId` to accept a
     * `user_requested` event, with or without a first message.
     */
    openDirect(message, options = {}) {
        return this.#conversations.openDirect(this.id, message, options);
    }
    /**
     * Streams events (spec 8.6), reconnecting with `Last-Event-ID` when the Company closes the stream, until
     * the conversation is closed or `signal` aborts. Falls back to long-polling a Company that doesn't stream.
     */
    async *stream(options = {}) {
        const { signal } = options;
        let first = true;
        while (!signal?.aborted) {
            if (!first)
                yield { type: "reconnected" };
            first = false;
            const response = await this.#conversations.session.fetch(withQuery(`${this.#url}/events`, this.#cursor === undefined ? {} : { cursor: this.#cursor }), {
                headers: {
                    accept: "text/event-stream",
                    ...(this.#cursor === undefined ? {} : { "last-event-id": this.#cursor }),
                },
                ...(signal === undefined ? {} : { signal }),
            });
            if (response.status === 429) {
                await response.body?.cancel();
                await sleep((parseRetryAfter(response.headers.get("retry-after")) ?? 1) * 1000, signal);
                continue;
            }
            if (!response.ok) {
                const error = await throwable(response);
                if (error.error === "cursor_expired" && this.#cursor !== undefined) {
                    this.#cursor = undefined;
                    continue;
                }
                throw error;
            }
            let progressed = false;
            if (response.headers.get("content-type")?.includes("text/event-stream") === true) {
                for await (const item of this.#readStream(response, signal)) {
                    progressed = true;
                    yield item;
                }
            }
            else {
                const json = await response.json().catch(() => undefined);
                if (!isObject(json))
                    throw new PoppyProtocolError("events response must be a JSON object");
                let update = this.apply(json);
                for (const event of update.events)
                    yield { type: "event", event };
                while ((update.hasMore || update.status !== "closed") && !signal?.aborted) {
                    update = await this.read({
                        wait: update.hasMore ? 0 : POLL_WAIT,
                        ...(signal === undefined ? {} : { signal }),
                    });
                    for (const event of update.events)
                        yield { type: "event", event };
                }
                return;
            }
            if (this.#status === "closed")
                return;
            if (!progressed)
                await sleep(RECONNECT_DELAY, signal).catch(() => undefined);
        }
    }
    async *#readStream(response, signal) {
        if (response.body === null)
            return;
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let eventName = "";
        let data = [];
        try {
            for (;;) {
                if (signal?.aborted)
                    return;
                const { value, done } = await reader.read();
                if (done)
                    return;
                buffer += value;
                let newline;
                while ((newline = /\r\n|\r|\n/.exec(buffer)) !== null) {
                    const line = buffer.slice(0, newline.index);
                    buffer = buffer.slice(newline.index + newline[0].length);
                    if (line === "") {
                        const item = this.#dispatch(eventName, data.join("\n"));
                        eventName = "";
                        data = [];
                        if (item !== undefined)
                            yield item;
                        continue;
                    }
                    if (line.startsWith(":"))
                        continue;
                    const colon = line.indexOf(":");
                    const field = colon === -1 ? line : line.slice(0, colon);
                    const fieldValue = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
                    if (field === "event")
                        eventName = fieldValue;
                    else if (field === "data")
                        data.push(fieldValue);
                }
            }
        }
        finally {
            await reader.cancel().catch(() => undefined);
        }
    }
    #dispatch(eventName, data) {
        if (data === "")
            return undefined;
        let json;
        try {
            json = JSON.parse(data);
        }
        catch {
            return undefined;
        }
        if (eventName === "text-delta") {
            if (!isObject(json) ||
                typeof json["message_id"] !== "string" ||
                typeof json["text"] !== "string")
                return undefined;
            return { type: "text-delta", messageId: json["message_id"], text: json["text"] };
        }
        if (eventName !== "" && eventName !== "message")
            return undefined;
        const before = this.#seen.size;
        const update = this.apply({ events: [json] });
        const event = update.events[0];
        return event === undefined || this.#seen.size === before ? undefined : { type: "event", event };
    }
}
//# sourceMappingURL=conversations.js.map