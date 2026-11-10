/**
 * Holds per-User state: pairwise User IDs, refresh tokens, DPoP keys and pending Direct Sign-Ins.
 * Values are secrets (spec 10.2), and the User ID mapping is confidential (spec 5.1), so use encrypted
 * storage in production.
 */
export interface Store {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
/** State is lost on exit, so every restart gives Users new User IDs and signs them out. */
export declare class MemoryStore implements Store {
    #private;
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
