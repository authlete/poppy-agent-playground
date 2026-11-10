import type { ConformanceReport } from "./run.ts";
/**
 * Known failures an agent's own repository records, so conformance can run in CI without failing while
 * still catching regressions. An entry is a whole scenario, `sign-in`, or one check in it,
 * `sign-in:oauth.dpop`.
 */
export type Baseline = readonly string[];
/**
 * Reads a baseline file:
 *
 * ```yaml
 * agent:
 *   - sign-in-dpop
 *   - sign-in:oauth.dpop
 * ```
 */
export declare function parseBaseline(text: string): Baseline;
export interface BaselineOutcome {
    /** Failures not in the baseline: regressions. */
    unexpected: string[];
    /** Failures the baseline expects. */
    expected: string[];
    /** Baseline entries that pass now, which should be removed. */
    stale: string[];
    /** Exit 1 on regressions or stale entries, as in MCP's conformance suite. */
    exitCode: 0 | 1;
}
/** Judges a report against a baseline, per check. */
export declare function applyBaseline(report: ConformanceReport, baseline: Baseline): BaselineOutcome;
