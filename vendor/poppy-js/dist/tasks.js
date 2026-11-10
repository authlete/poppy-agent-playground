import { PoppyProtocolError } from "./errors.js";
import { isObject } from "./http.js";
function parseReference(value, company) {
    if (!isObject(value) || typeof value["url"] !== "string")
        return undefined;
    const { type, url } = value;
    const listed = (apiType) => company.apis.some((api) => api.type === apiType && api.url === url);
    if (type === "openapi") {
        // Must name a listed API, so an alternative can't aim the agent at another server (spec 9.2).
        if (typeof value["operation_id"] !== "string" || !listed("openapi"))
            return undefined;
        return { type, url, operationId: value["operation_id"] };
    }
    if (type === "mcp") {
        if (typeof value["tool"] !== "string" || !listed("mcp"))
            return undefined;
        return { type, url, tool: value["tool"] };
    }
    if (type === "web") {
        try {
            return new URL(url).protocol === "https:" ? { type, url } : undefined;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
export function parseAlternative(value, company) {
    if (!isObject(value))
        return undefined;
    const instructions = typeof value["instructions"] === "string" ? value["instructions"] : undefined;
    const references = Array.isArray(value["references"])
        ? value["references"].flatMap((ref) => {
            const parsed = parseReference(ref, company);
            return parsed === undefined ? [] : [parsed];
        })
        : [];
    if (instructions === undefined && references.length === 0)
        return undefined;
    return { instructions, references };
}
export function parseExcludedTasks(body, company) {
    if (!isObject(body) || !Array.isArray(body["tasks"]))
        throw new PoppyProtocolError("excluded tasks must have a tasks list");
    return body["tasks"].flatMap((entry) => {
        if (!isObject(entry) || typeof entry["task"] !== "string")
            return [];
        return [{ task: entry["task"], alternative: parseAlternative(entry["alternative"], company) }];
    });
}
export function checkFeedback(report) {
    if (report.task === "" || report.task.length > 200)
        throw new PoppyProtocolError("feedback task must be 1 to 200 characters");
    if (report.description === "" || report.description.length > 2000)
        throw new PoppyProtocolError("feedback description must be 1 to 2,000 characters");
}
//# sourceMappingURL=tasks.js.map