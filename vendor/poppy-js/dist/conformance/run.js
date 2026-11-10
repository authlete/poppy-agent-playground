import { CHECKS } from "./checks.js";
import { ConformanceCompany } from "./company.js";
import { SCENARIOS } from "./scenarios.js";
/** Reads what a scenario's Company recorded, after the agent is done. */
export function scenarioResult(definition, company, stepErrors) {
    definition.evaluate?.(company);
    const order = (id) => CHECKS.findIndex((check) => check.id === id);
    const checks = [...company.results()]
        .map(([id, details]) => ({
        id,
        status: details.length === 0 ? "pass" : "fail",
        details,
    }))
        .sort((a, b) => order(a.id) - order(b.id));
    return { scenario: definition.name, description: definition.description, checks, stepErrors };
}
/** Rolls scenario results up into one verdict per check. */
export function summarize(scenarios) {
    const results = CHECKS.map((check) => {
        const seen = scenarios.flatMap((s) => s.checks.filter((c) => c.id === check.id).map((c) => ({ ...c, scenario: s.scenario })));
        if (seen.length === 0)
            return { ...check, status: "skip", details: ["not exercised"] };
        const failures = seen.filter((c) => c.status === "fail");
        return {
            ...check,
            status: failures.length > 0 ? "fail" : "pass",
            details: failures.flatMap((c) => c.details.map((d) => `${c.scenario}: ${d}`)),
        };
    });
    return {
        protocolVersion: "0.3",
        scenarios,
        results,
        passed: results.filter((r) => r.status === "pass").length,
        failed: results.filter((r) => r.status === "fail").length,
        skipped: results.filter((r) => r.status === "skip").length,
    };
}
async function runStep(step, driver, company) {
    switch (step.action) {
        case "discover":
            return driver.discover(step.website);
        case "request": {
            await driver.request(step.url, {
                ...(step.method === undefined ? {} : { method: step.method }),
                ...(step.body === undefined ? {} : { body: step.body }),
            });
            return;
        }
        case "sign_in":
            if (driver.signInDirect === undefined)
                throw new Error("the driver has no signInDirect()");
            // The User's browser: open the authorization URL and come back with its redirect.
            return driver.signInDirect(step.scopes, async (url) => {
                const response = await company.fetch(url, { redirect: "manual" });
                return response.headers.get("location") ?? "";
            });
        case "sign_out":
            if (driver.signOut === undefined)
                throw new Error("the driver has no signOut()");
            return driver.signOut();
        case "converse":
            if (driver.converse === undefined)
                throw new Error("the driver has no converse()");
            return driver.converse(step.text);
        case "request_with_approval":
            if (driver.requestWithApproval === undefined)
                throw new Error("the driver has no requestWithApproval()");
            await driver.requestWithApproval(step.url, { method: step.method, body: step.body });
            return;
    }
}
/**
 * Runs scenarios against fresh agents from `factory`, in this process, and reports each check as passed,
 * failed or skipped.
 */
export async function runConformance(factory, options = {}) {
    const selected = SCENARIOS.filter((s) => options.scenarios === undefined || options.scenarios.includes(s.name));
    const results = [];
    for (const definition of selected) {
        const company = new ConformanceCompany(definition.company, options.agentFetch === undefined ? {} : { agentFetch: options.agentFetch });
        const driver = await factory({ fetch: company.fetch });
        const stepErrors = [];
        for (const step of definition.steps) {
            try {
                await runStep(step, driver, company);
            }
            catch (error) {
                stepErrors.push(`${step.action}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        results.push(scenarioResult(definition, company, stepErrors));
    }
    return summarize(results);
}
/** A plain-text report, one line per check. */
export function formatReport(report) {
    const mark = { pass: "PASS", fail: "FAIL", skip: "SKIP" };
    const lines = report.results.map((r) => {
        const line = `${mark[r.status]}  ${r.level.padEnd(6)} ${r.section.padEnd(13)} ${r.id}`;
        return r.status === "pass" ? line : `${line}\n        ${r.details.join("\n        ")}`;
    });
    return [
        `Personal Agent Protocol ${report.protocolVersion} conformance: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`,
        ...lines,
    ].join("\n");
}
//# sourceMappingURL=run.js.map