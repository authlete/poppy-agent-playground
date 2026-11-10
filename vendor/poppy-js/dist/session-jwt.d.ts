import { type Signer } from "./jose.ts";
/** Spec 5.2: a delegation lasts at most 24 hours. */
export declare const MAX_DELEGATION_LIFETIME: number;
interface Delegated {
    privateKey: CryptoKey;
    kid: string;
    delegation: string;
    exp: number;
}
/**
 * The delegated keys of one User ID (spec 5.2). Each key signs only this User ID's Session JWTs, so
 * Companies can't match the User across Companies by key, and a leaked key exposes only this User at one
 * Company (spec 10.7). Keys live only in memory: Companies must not expect them to stay the same.
 */
export declare class DelegatedKeys {
    #private;
    constructor(clientId: string, signer: Signer, lifetime: number);
    current(): Promise<Delegated>;
}
export interface SessionClaims {
    clientId: string;
    /** The Company's identifier (spec 3.2). */
    audience: string;
    sid: string;
    userId: string;
    agentId: string | undefined;
    method: string;
    url: URL;
    accessToken: string | undefined;
}
/** Signs a fresh Session JWT for one request (spec 5.2). */
export declare function signSessionJwt(keys: DelegatedKeys, claims: SessionClaims): Promise<string>;
export {};
