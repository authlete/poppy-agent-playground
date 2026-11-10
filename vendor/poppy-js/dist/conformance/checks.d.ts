/** How strongly the spec states a rule. */
export type Level = "MUST" | "SHOULD";
/** One rule the spec sets for Personal Agents, as the conformance suite checks it. */
export interface Check {
    id: string;
    /** The spec section, such as `5.2`, or an extension's name and section. */
    section: string;
    level: Level;
    title: string;
}
/** Every check the suite runs, in the order they appear in a report. */
export declare const CHECKS: readonly Check[];
export declare function checkById(id: string): Check;
