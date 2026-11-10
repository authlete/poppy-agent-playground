import { PoppyProtocolError } from "./errors.js";
import { getBytes } from "./http.js";
/**
 * Fetches one skill from a Company's `skill_index` and checks its `digest` (spec 9.4). The request carries
 * no Session header, token or other credential, wherever the artifact is. A skill is Company content: it
 * grants no account access and supplies no User approval, and you mustn't run its scripts unless the User
 * or your configuration allows it.
 */
export async function fetchSkill(company, name, options = {}) {
    const skill = company.skills.find((entry) => entry.name === name);
    if (skill === undefined)
        throw new PoppyProtocolError(`${company.domain} lists no skill ${name}`);
    const bytes = await getBytes(options.fetch ?? fetch, new URL(skill.url), "skill artifact", options.allowPrivateAddresses ?? false);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (`sha256:${hex}` !== skill.digest)
        throw new PoppyProtocolError(`skill ${name} doesn't match its digest`);
    return {
        skill,
        bytes,
        text: skill.type === "skill-md"
            ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
            : undefined,
    };
}
//# sourceMappingURL=skills.js.map