const TOKEN = /^[!#$%&'*+\-.^_`|~\w]+/;
/** Parses every challenge in a `WWW-Authenticate` header, including several schemes in one header. */
export function parseChallenges(header) {
    if (header === null)
        return [];
    const challenges = [];
    let rest = header.trim();
    let current;
    const finish = () => {
        if (current === undefined)
            return;
        const { scheme, params } = current;
        challenges.push({
            scheme,
            error: params["error"],
            scope: params["scope"],
            resourceMetadata: params["resource_metadata"],
            extension: params["extension"],
            params,
        });
    };
    while (rest.length > 0) {
        rest = rest.replace(/^[\s,]+/, "");
        const name = TOKEN.exec(rest)?.[0];
        if (name === undefined)
            break;
        const afterName = rest.slice(name.length);
        const param = /^\s*=\s*/.exec(afterName);
        if (param === null || current === undefined) {
            // A scheme, possibly followed by a token68 we ignore.
            finish();
            current = { scheme: name.toLowerCase(), params: {} };
            rest = afterName.replace(/^\s+[\w\-.~+/]+=*\s*(?=,|$)/, "");
            continue;
        }
        let value;
        let remaining = afterName.slice(param[0].length);
        if (remaining.startsWith('"')) {
            let index = 1;
            value = "";
            while (index < remaining.length && remaining[index] !== '"') {
                if (remaining[index] === "\\")
                    index++;
                value += remaining[index] ?? "";
                index++;
            }
            remaining = remaining.slice(index + 1);
        }
        else {
            value = TOKEN.exec(remaining)?.[0] ?? "";
            remaining = remaining.slice(value.length);
        }
        current.params[name.toLowerCase()] = value;
        rest = remaining;
    }
    finish();
    return challenges;
}
/** The first challenge with an `error`, or else the first challenge, of a response. */
export function authChallenge(response) {
    const challenges = parseChallenges(response.headers.get("www-authenticate"));
    return challenges.find((challenge) => challenge.error !== undefined) ?? challenges[0];
}
/**
 * What a response says about account access (spec 7, 8.11): the scopes the request needs when it has no
 * access token (HTTP 401 with no error) or lacks scopes (`insufficient_scope`), else undefined.
 */
export function scopesNeeded(response) {
    const challenge = authChallenge(response);
    if (challenge === undefined)
        return undefined;
    if (response.status === 401 && challenge.error === undefined)
        return challenge.scope ?? "";
    if (challenge.error === "insufficient_scope")
        return challenge.scope ?? "";
    return undefined;
}
//# sourceMappingURL=challenge.js.map