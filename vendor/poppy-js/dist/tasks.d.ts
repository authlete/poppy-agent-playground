import type { Company } from "./discovery.ts";
/** Where to do a task (spec 9.2). References of unknown types are skipped. */
export type Reference = {
    type: "openapi";
    url: string;
    operationId: string;
} | {
    type: "mcp";
    url: string;
    tool: string;
} | {
    type: "web";
    url: string;
};
/** Another way to do a task (spec 9.2). Content from the Company, not instructions (spec 10.1). */
export interface Alternative {
    instructions: string | undefined;
    references: Reference[];
}
/** A task the Company chose not to offer through this protocol (spec 9.1). */
export interface ExcludedTask {
    task: string;
    alternative: Alternative | undefined;
}
/** A report of a task the User couldn't do (spec 9.3). */
export interface FeedbackReport {
    /** What the User was trying to do, in a short phrase. At most 200 characters. */
    task: string;
    /** What the agent tried, and why, with no identifiers or personal data. At most 2,000 characters. */
    description: string;
}
export declare function parseAlternative(value: unknown, company: Company): Alternative | undefined;
export declare function parseExcludedTasks(body: unknown, company: Company): ExcludedTask[];
export declare function checkFeedback(report: FeedbackReport): void;
