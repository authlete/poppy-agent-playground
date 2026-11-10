import { type Check } from "./checks.ts";
import { ConformanceCompany } from "./company.ts";
import { type ScenarioDefinition } from "./scenarios.ts";
/**
 * A TypeScript agent under test, called in this process. Every method other than `discover` and
 * `request` is optional: steps that need a missing method are skipped, and so are the checks they decide.
 * Agents in other languages run as a process instead; see the `@descope/poppy-conformance` CLI.
 */
export interface AgentDriver {
    /** Discovers the Company at `website`. Rejects if the agent refuses it. */
    discover(website: string): Promise<void>;
    /** Sends a request through the agent, signed in if it is. Resolves with the response status. */
    request(url: string, init?: {
        method?: string;
        body?: string;
    }): Promise<number>;
    /**
     * Signs in with Direct Sign-In for `scope`. Call `browser` with the authorization URL; it returns the
     * URL the User's browser comes back to.
     */
    signInDirect?(scope: string[], browser: (authorizationUrl: string) => Promise<string>): Promise<void>;
    signOut?(): Promise<void>;
    /** Starts a conversation with the Company Agent, and sends one more message. */
    converse?(text: string): Promise<void>;
    /** Sends a request the Company refuses with `approval_required`, approves it, and retries. */
    requestWithApproval?(url: string, init: {
        method: string;
        body: string;
    }): Promise<number>;
}
/** Makes a fresh agent, with no state, that sends all of its HTTP through `fetch`. */
export type AgentFactory = (env: {
    fetch: typeof fetch;
}) => Promise<AgentDriver>;
export interface ConformanceOptions {
    /**
     * Fetches the agent's client metadata and key set, as a Company would. Defaults to the global `fetch`,
     * so they must be published, unless you serve them yourself.
     */
    agentFetch?: typeof fetch;
    /** Run only these scenarios, by name. Defaults to all. */
    scenarios?: readonly string[];
}
export type CheckStatus = "pass" | "fail" | "skip";
/** One check's verdict in one scenario. */
export interface ScenarioCheck {
    id: string;
    status: "pass" | "fail";
    details: string[];
}
export interface ScenarioResult {
    scenario: string;
    description: string;
    checks: ScenarioCheck[];
    /** Steps the agent couldn't carry out, with why. Expected in scenarios it should refuse. */
    stepErrors: string[];
}
export interface CheckResult extends Check {
    status: CheckStatus;
    /** Why it failed, with the scenario, or why it was skipped. */
    details: string[];
}
export interface ConformanceReport {
    /** The spec draft the suite checks. */
    protocolVersion: "0.3";
    scenarios: ScenarioResult[];
    /** Every check, across all scenarios: failed if any scenario failed it. */
    results: CheckResult[];
    passed: number;
    failed: number;
    skipped: number;
}
/** Reads what a scenario's Company recorded, after the agent is done. */
export declare function scenarioResult(definition: ScenarioDefinition, company: ConformanceCompany, stepErrors: string[]): ScenarioResult;
/** Rolls scenario results up into one verdict per check. */
export declare function summarize(scenarios: ScenarioResult[]): ConformanceReport;
/**
 * Runs scenarios against fresh agents from `factory`, in this process, and reports each check as passed,
 * failed or skipped.
 */
export declare function runConformance(factory: AgentFactory, options?: ConformanceOptions): Promise<ConformanceReport>;
/** A plain-text report, one line per check. */
export declare function formatReport(report: ConformanceReport): string;
