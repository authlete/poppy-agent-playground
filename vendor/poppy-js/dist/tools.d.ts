import type { PoppyUser } from "./agent.ts";
import type { Company } from "./discovery.ts";
import { type Operation } from "./operations.ts";
import type { Session } from "./session.ts";
/** A JSON Schema object, as tool-calling APIs take it. */
export type JsonSchema = Record<string, unknown>;
/** What a tool returns: JSON for the model. Never holds a token, key, Session JWT or code. */
export type ToolResult = Record<string, unknown>;
/**
 * A tool for a model, independent of any framework. Turn a list of them into your framework's form with
 * {@link toAiSdkTools}, {@link toAnthropicTools}, {@link toOpenAITools} or {@link toMcpTools}.
 */
export interface PoppyTool {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    execute(input: unknown): Promise<ToolResult>;
}
/** Asks the User, in your own interface, to approve an operation's exact terms (Operations section 5). */
export interface ApprovalRequest {
    company: Company;
    operation: Operation;
    /** The summary as safe HTML: only emphasis, paragraphs and lists. */
    summaryHtml: string;
}
/** Asks the User to sign in for some scopes, with any sign-in type you support (spec 5.4). */
export interface SignInRequest {
    company: Company;
    user: PoppyUser;
    scope: string[];
}
export interface PoppyToolsOptions {
    /** The User the tools act for. */
    user: PoppyUser;
    /** The Session to use. Defaults to a new one from `user.session()`. */
    session?: Session;
    /** Prefix of every tool name, such as `northwind` when a model works with several Companies. */
    prefix?: string;
    /**
     * Shows the User an operation and resolves with their answer. Without it, the tools never approve
     * anything: they report that the action needs approval and wasn't performed.
     */
    requestApproval?: (request: ApprovalRequest) => Promise<boolean>;
    /**
     * Has the User sign in, and resolves true once they have. Without it, the tools report the scopes a
     * request needs and leave sign-in to you.
     */
    signIn?: (request: SignInRequest) => Promise<boolean>;
    /** Longest response body passed to the model, in characters. Defaults to 20,000. */
    maxResponseChars?: number;
    /** Seconds a conversation tool waits for the Company Agent's reply. Defaults to 20. */
    conversationWait?: number;
}
/**
 * Builds tools that let a model work with one Company for one User: read what the Company offers, call its
 * APIs, talk to its Company Agent, and report tasks it can't do.
 *
 * The model never sees a token, key, Session JWT or sign-in code: the tools sign every request in this
 * process. Approvals and sign-in go through your `requestApproval` and `signIn` callbacks, so they come
 * from the User through your interface, never from the model or the Company (spec 10.1, 10.2).
 */
export declare function poppyTools(options: PoppyToolsOptions): PoppyTool[];
/** Runs a tool by name, for tool-calling loops you write yourself. */
export declare function runTool(tools: readonly PoppyTool[], name: string, input: unknown): Promise<ToolResult>;
/** The definition this package hands to the AI SDK's `tool()`. */
export interface AiSdkToolDefinition {
    description: string;
    inputSchema: unknown;
    execute: (input: unknown) => Promise<ToolResult>;
}
/**
 * Vercel AI SDK tools: `generateText({ tools: toAiSdkTools(poppyTools(...), { tool, jsonSchema }) })`.
 * Pass `tool` and `jsonSchema` from the `ai` package, so this package needs no dependency on it.
 */
export declare function toAiSdkTools<Tool extends (definition: never) => unknown, JsonSchemaFn extends (schema: never) => unknown>(tools: readonly PoppyTool[], helpers: {
    tool: Tool;
    jsonSchema: JsonSchemaFn;
}): Record<string, ReturnType<Tool>>;
/** Anthropic Messages API `tools`. Run calls with {@link runTool}. */
export declare function toAnthropicTools(tools: readonly PoppyTool[]): {
    name: string;
    description: string;
    input_schema: JsonSchema;
}[];
/** OpenAI Chat Completions `tools`. Run calls with {@link runTool}. */
export declare function toOpenAITools(tools: readonly PoppyTool[]): {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: JsonSchema;
    };
}[];
/**
 * Handlers for an MCP server's `tools/list` and `tools/call` requests, so any MCP client can use a
 * Company's tools. Results follow MCP's `CallToolResult`, with the JSON in `structuredContent` too.
 */
export declare function toMcpTools(tools: readonly PoppyTool[]): {
    listTools(): {
        tools: {
            name: string;
            description: string;
            inputSchema: JsonSchema;
        }[];
    };
    callTool(params: {
        name: string;
        arguments?: Record<string, unknown> | undefined;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        structuredContent: ToolResult;
        isError: boolean;
    }>;
};
