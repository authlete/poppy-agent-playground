import type { Company, Skill } from "./discovery.ts";
import { type Fetch } from "./http.ts";
export interface FetchSkillOptions {
    /** Defaults to the global `fetch`. */
    fetch?: Fetch;
    allowPrivateAddresses?: boolean;
}
/** A skill artifact whose digest matched its `skill_index` entry (spec 9.4). */
export interface SkillArtifact {
    skill: Skill;
    /** The artifact's raw bytes. */
    bytes: Uint8Array;
    /**
     * The `SKILL.md` text, for a `skill-md` skill. An `archive` skill is left to you to unpack, following the
     * Agent Skills discovery proposal's layout and extraction checks.
     */
    text: string | undefined;
}
/**
 * Fetches one skill from a Company's `skill_index` and checks its `digest` (spec 9.4). The request carries
 * no Session header, token or other credential, wherever the artifact is. A skill is Company content: it
 * grants no account access and supplies no User approval, and you mustn't run its scripts unless the User
 * or your configuration allows it.
 */
export declare function fetchSkill(company: Company, name: string, options?: FetchSkillOptions): Promise<SkillArtifact>;
