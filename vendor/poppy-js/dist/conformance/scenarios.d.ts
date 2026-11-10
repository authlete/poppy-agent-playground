import { type ConformanceCompany, type Scenario } from "./company.ts";
/**
 * One thing the agent under test does. Agents in any language carry out steps in order, and keep going
 * when one fails: a refused discovery should make later steps fail, never crash the agent.
 */
export type Step = 
/** Discover the Company at `website`, and get ready to act for a User there. */
{
    action: "discover";
    website: string;
}
/** Send a request through the agent's Session, signed in if it is. */
 | {
    action: "request";
    url: string;
    method?: string;
    body?: string;
}
/**
 * Sign in with Direct Sign-In. Act as the User's browser: GET the authorization URL without following
 * redirects, and complete sign-in with the `Location` it returns.
 */
 | {
    action: "sign_in";
    scopes: string[];
}
/** Sign out of the account. */
 | {
    action: "sign_out";
}
/** Start a conversation with the Company Agent with `text`, then send one more message. */
 | {
    action: "converse";
    text: string;
}
/**
 * Send a request the Company refuses with `approval_required`, approve the operation as if the User
 * said yes, and send it again with the approval.
 */
 | {
    action: "request_with_approval";
    url: string;
    method: string;
    body: string;
};
/** Which parts of the protocol a scenario exercises. */
export type Suite = "core" | "oauth" | "interactions";
/** A scenario: how the Company behaves, what the agent does, and the checks it decides. */
export interface ScenarioDefinition {
    name: string;
    description: string;
    suite: Suite;
    company: Scenario;
    steps: Step[];
    /** Checks this scenario decides, beyond those the Company records as the agent talks to it. */
    evaluate?: (company: ConformanceCompany) => void;
}
export declare const SCENARIOS: readonly ScenarioDefinition[];
export declare function scenarioByName(name: string): ScenarioDefinition;
