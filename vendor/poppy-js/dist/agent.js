import { Account, PENDING_LIFETIME, PENDING_PREFIX, } from "./account.js";
import { discover } from "./discovery.js";
import { PoppyProtocolError } from "./errors.js";
import { httpsUrl } from "./http.js";
import { randomId, signerFromKey } from "./jose.js";
import { isLoopbackRedirect } from "./metadata.js";
import { requireOAuth } from "./oauth.js";
import { ResourceResolver } from "./resources.js";
import { Session } from "./session.js";
import { DelegatedKeys } from "./session-jwt.js";
import { MemoryStore } from "./store.js";
const STORE_PREFIX = "poppy:0.3";
/** A Personal Agent. Gives each of its Users a pairwise User ID at each Company, and opens their Sessions. */
export class PoppyAgent {
    clientId;
    extensions;
    #signer;
    #store;
    #fetch;
    #allowPrivate;
    #redirectUri;
    #delegationLifetime;
    #operator;
    #users = new Map();
    /**
     * One Account per stored account, shared by every PoppyUser for it (each agent name and domain), so
     * refresh token rotation and sign-out run through one queue (spec 4.4, 5.1).
     */
    #accounts = new Map();
    #ids = new Map();
    #pendingIndex = Promise.resolve();
    #keys = new Map();
    #resolvers = new Map();
    constructor(options) {
        if (httpsUrl(options.clientId, "clientId").href !== options.clientId)
            throw new PoppyProtocolError("clientId must be a normalized URL, exactly as published");
        const signer = options.signer ??
            (options.signingKey === undefined ? undefined : signerFromKey(options.signingKey));
        if (signer === undefined)
            throw new TypeError("give signingKey or signer");
        if (options.redirectUri !== undefined)
            checkRedirectUri(options.redirectUri);
        this.clientId = options.clientId;
        this.extensions = options.extensions ?? {};
        this.#signer = signer;
        this.#store = options.store ?? new MemoryStore();
        this.#fetch = options.fetch ?? fetch;
        this.#allowPrivate = options.allowPrivateAddresses ?? false;
        this.#redirectUri = options.redirectUri;
        this.#delegationLifetime = options.delegationLifetime ?? 3600;
        this.#operator = options.operatorSignature;
    }
    /** Like {@link discover}, using this agent's `fetch` and `allowPrivateAddresses`. */
    discover(website) {
        return discover(website, { fetch: this.#fetch, allowPrivateAddresses: this.#allowPrivate });
    }
    /** Whether this agent lists an extension at a version (spec 3.3). */
    supports(name, version) {
        return this.extensions[name]?.version === version;
    }
    /**
     * Returns one of your Users at a Company, with a stable User ID made for that Company alone (spec 5.1).
     * `localUserId` is your own ID for the User. The Company never sees it: it gets a random ID this agent
     * stores, so the ID is opaque, differs at each Company, and isn't derived from personal data.
     */
    user(company, localUserId, options = {}) {
        if (localUserId === "")
            return Promise.reject(new PoppyProtocolError("localUserId is required"));
        const account = options.account ?? "default";
        // Keyed by domain too: domains that share an issuer keep their own poppy.json (spec 3.2).
        const key = JSON.stringify([
            company.identifier,
            localUserId,
            account,
            options.agent ?? null,
            company.domain,
        ]);
        let user = this.#users.get(key);
        if (user === undefined) {
            user = this.#openUser(company, localUserId, account, options.agent);
            user.catch(() => {
                if (this.#users.get(key) === user)
                    this.#users.delete(key);
            });
            this.#users.set(key, user);
        }
        return user;
    }
    /**
     * A User with a new User ID for one anonymous browsing session, like a private browser window (spec
     * 5.1). Nothing is stored, and it can't sign in. Discard it when the browsing session ends.
     */
    anonymousUser(company) {
        return new PoppyUser(this, {
            company,
            localUserId: undefined,
            userId: randomId("anon_"),
            agentId: undefined,
            accountName: undefined,
            agentName: undefined,
            account: undefined,
        });
    }
    /**
     * Finishes a Direct Sign-In from the URL the User's browser was sent back to (spec 4.2), in any process
     * that shares this agent's store. Resolves with the User and the granted scopes.
     */
    async completeDirectSignIn(company, callbackUrl) {
        const params = new URL(String(callbackUrl)).searchParams;
        const state = params.get("state");
        if (state === null)
            throw new PoppyProtocolError("the sign-in response has no state");
        const key = `${PENDING_PREFIX}${state}`;
        const stored = await this.#store.get(key);
        if (stored === undefined)
            throw new PoppyProtocolError("unknown or already used sign-in state");
        // Single use, whatever the outcome.
        await this.#store.delete(key);
        const record = JSON.parse(stored);
        await this.trackPendingSignIn(state, undefined);
        if (Date.now() > record.expiresAt)
            throw new PoppyProtocolError("the sign-in expired");
        if (record.identifier !== company.identifier)
            throw new PoppyProtocolError("the sign-in was started at another Company");
        const user = await this.user(company, record.localUserId, {
            account: record.account,
            ...(record.agent === undefined ? {} : { agent: record.agent }),
        });
        return { user, scope: await user.accountFor().completeDirect(record, params) };
    }
    /**
     * Signs the account out and deletes its stored state. With `userIds`, also deletes the User's User ID
     * and Agent IDs at this Company, so the Company sees a new User next time.
     */
    async forget(company, localUserId, options = {}) {
        const { userIds, ...userOptions } = options;
        const user = await this.user(company, localUserId, userOptions);
        const account = userOptions.account ?? "default";
        if (company.oauth !== undefined) {
            await user.accountFor().forget();
            await this.dropPendingSignIns(company.identifier, localUserId, account);
        }
        this.#accounts.delete(this.#accountKey(company, localUserId, account));
        // Every PoppyUser for this account, whatever its agent name or domain, held the forgotten Account.
        // Deleted User IDs are shared by all accounts, so then every account's PoppyUsers go.
        for (const key of this.#users.keys()) {
            const [identifier, local, name] = JSON.parse(key);
            if (identifier === company.identifier &&
                local === localUserId &&
                (name === account || userIds === true))
                this.#users.delete(key);
        }
        if (userIds === true) {
            const idsKey = this.#idsKey(company, localUserId);
            this.#ids.delete(idsKey);
            await this.#store.delete(idsKey);
        }
    }
    #idsKey(company, localUserId) {
        return `${STORE_PREFIX}:ids:${JSON.stringify([this.clientId, company.identifier, localUserId])}`;
    }
    /** User IDs and Agent IDs are scoped by the Company's identifier, not a host (spec 5.1). */
    async #userIds(company, localUserId, agent) {
        const key = this.#idsKey(company, localUserId);
        const previous = this.#ids.get(key) ?? Promise.resolve(undefined);
        const next = previous
            .catch(() => undefined)
            .then(async (cached) => {
            let ids = cached;
            if (ids === undefined) {
                const stored = await this.#store.get(key);
                ids =
                    stored === undefined
                        ? { userId: randomId("usr_"), agentIds: {} }
                        : JSON.parse(stored);
                if (stored === undefined)
                    await this.#store.set(key, JSON.stringify(ids));
            }
            if (agent !== undefined && ids.agentIds[agent] === undefined) {
                ids = { ...ids, agentIds: { ...ids.agentIds, [agent]: randomId("agt_") } };
                await this.#store.set(key, JSON.stringify(ids));
            }
            return ids;
        });
        this.#ids.set(key, next);
        return next;
    }
    async #openUser(company, localUserId, accountName, agentName) {
        const ids = await this.#userIds(company, localUserId, agentName);
        const account = company.oauth === undefined
            ? undefined
            : await this.#account(company, localUserId, accountName);
        return new PoppyUser(this, {
            company,
            localUserId,
            userId: ids.userId,
            agentId: agentName === undefined ? undefined : ids.agentIds[agentName],
            accountName,
            agentName,
            account,
        });
    }
    #accountKey(company, localUserId, accountName) {
        return `${STORE_PREFIX}:account:${JSON.stringify([this.clientId, company.identifier, localUserId, accountName])}`;
    }
    #account(company, localUserId, accountName) {
        const storeKey = this.#accountKey(company, localUserId, accountName);
        let account = this.#accounts.get(storeKey);
        if (account === undefined) {
            const created = new Account({
                clientId: this.clientId,
                signer: this.#signer,
                fetch: this.#fetch,
                store: this.#store,
                storeKey,
                company,
            });
            account = created.load().then(() => created);
            account.catch(() => {
                if (this.#accounts.get(storeKey) === account)
                    this.#accounts.delete(storeKey);
            });
            this.#accounts.set(storeKey, account);
        }
        return account;
    }
    /**
     * @internal Keeps an index of pending Direct Sign-Ins, and deletes the records of expired ones, so an
     * abandoned sign-in doesn't leave its PKCE verifier in the store. `expiresAt` undefined removes `state`.
     */
    trackPendingSignIn(state, expiresAt) {
        const indexKey = `${PENDING_PREFIX}index`;
        const run = this.#pendingIndex.then(async () => {
            const stored = await this.#store.get(indexKey);
            const index = stored === undefined ? {} : JSON.parse(stored);
            const now = Date.now();
            for (const [pending, expires] of Object.entries(index)) {
                if (expires >= now && pending !== state)
                    continue;
                delete index[pending];
                if (pending !== state)
                    await this.#store.delete(`${PENDING_PREFIX}${pending}`);
            }
            if (expiresAt !== undefined)
                index[state] = expiresAt;
            await this.#store.set(indexKey, JSON.stringify(index));
        });
        this.#pendingIndex = run.catch(() => undefined);
        return run;
    }
    /**
     * @internal Deletes the pending Direct Sign-Ins an account started, so a callback that arrives after
     * sign-out or forget can't sign it back in.
     */
    dropPendingSignIns(identifier, localUserId, account) {
        const indexKey = `${PENDING_PREFIX}index`;
        const run = this.#pendingIndex.then(async () => {
            const stored = await this.#store.get(indexKey);
            if (stored === undefined)
                return;
            const index = JSON.parse(stored);
            for (const state of Object.keys(index)) {
                const key = `${PENDING_PREFIX}${state}`;
                const value = await this.#store.get(key);
                if (value !== undefined) {
                    const record = JSON.parse(value);
                    if (record.identifier !== identifier ||
                        record.localUserId !== localUserId ||
                        record.account !== account)
                        continue;
                    await this.#store.delete(key);
                }
                delete index[state];
            }
            await this.#store.set(indexKey, JSON.stringify(index));
        });
        this.#pendingIndex = run.catch(() => undefined);
        return run;
    }
    /** @internal */
    sessionInit(company, userId, anonymous = false) {
        // One set of delegated keys per User ID, so no key signs for two (spec 5.2). An anonymous User's
        // keys live only as long as its PoppyUser, so they're discarded with it (spec 5.1).
        const keysKey = JSON.stringify([company.identifier, userId]);
        let keys = anonymous ? undefined : this.#keys.get(keysKey);
        if (keys === undefined) {
            keys = new DelegatedKeys(this.clientId, this.#signer, this.#delegationLifetime);
            if (!anonymous)
                this.#keys.set(keysKey, keys);
        }
        const resolverKey = `${company.identifier} ${company.domain}`;
        let resolver = this.#resolvers.get(resolverKey);
        if (resolver === undefined) {
            resolver = new ResourceResolver(company, this.#fetch, this.#allowPrivate);
            this.#resolvers.set(resolverKey, resolver);
        }
        return {
            keys,
            resolver,
            fetch: this.#fetch,
            operator: this.#operator,
            allowPrivateAddresses: this.#allowPrivate,
        };
    }
    /** @internal */
    get defaultRedirectUri() {
        return this.#redirectUri;
    }
}
function checkRedirectUri(uri) {
    if (!isLoopbackRedirect(uri))
        httpsUrl(uri, "redirectUri");
}
/** One of your Users at one Company, in one account. Get one from {@link PoppyAgent.user}. */
export class PoppyUser {
    company;
    /** The pairwise User ID the Company sees (spec 5.1). Keep the mapping confidential. */
    userId;
    agentId;
    /** True for {@link PoppyAgent.anonymousUser}, which never sends an access token (spec 5.4). */
    anonymous;
    #agent;
    #init;
    #anonymousInit;
    constructor(agent, init) {
        this.#agent = agent;
        this.#init = init;
        this.company = init.company;
        this.userId = init.userId;
        this.agentId = init.agentId;
        this.anonymous = init.localUserId === undefined;
    }
    /** Whether this account holds a refresh token (spec 4.4). */
    get signedIn() {
        return this.#init.account?.signedIn === true;
    }
    /** The scopes of the refresh token. Empty when signed out. */
    get scope() {
        return this.#init.account?.scope ?? [];
    }
    /**
     * Starts a new Session with a fresh random `sid` (spec 5.2). Run several for tasks in parallel. Sessions
     * share this account's sign-in.
     */
    session() {
        return new Session({
            company: this.company,
            clientId: this.#agent.clientId,
            userId: this.userId,
            agentId: this.agentId,
            account: this.#init.account,
            ...this.#sessionInit(),
        });
    }
    #sessionInit() {
        if (!this.anonymous)
            return this.#agent.sessionInit(this.company, this.userId);
        this.#anonymousInit ??= this.#agent.sessionInit(this.company, this.userId, true);
        return this.#anonymousInit;
    }
    /** @internal */
    accountFor() {
        if (this.anonymous)
            throw new PoppyProtocolError("an anonymous User can't sign in (spec 5.4)");
        requireOAuth(this.company);
        const account = this.#init.account;
        if (account === undefined)
            throw new PoppyProtocolError(`${this.company.domain} offers no sign-in`);
        return account;
    }
    /**
     * Starts Direct Sign-In (spec 4.2): open `url` in the User's browser, then pass the URL their browser is
     * sent back to {@link completeDirectSignIn} or {@link PoppyAgent.completeDirectSignIn}. Requests the
     * scopes already held too, unless `replaceScopes`, since the new refresh token replaces the old (4.7).
     * Only for a User who signs in themselves (spec 5.4).
     */
    startDirectSignIn(options) {
        const account = this.accountFor();
        const redirectUri = options.redirectUri ?? this.#agent.defaultRedirectUri;
        if (redirectUri === undefined)
            throw new PoppyProtocolError("Direct Sign-In needs a redirectUri");
        checkRedirectUri(redirectUri);
        return account
            .startDirect({
            scope: options.scope,
            redirectUri,
            ...(options.replaceScopes === undefined ? {} : { replaceScopes: options.replaceScopes }),
        }, {
            localUserId: this.#init.localUserId ?? "",
            account: this.#init.accountName ?? "default",
            agent: this.#init.agentName,
        })
            .then(async (started) => {
            await this.#agent.trackPendingSignIn(started.state, Date.now() + PENDING_LIFETIME);
            return started;
        });
    }
    /** Finishes Direct Sign-In for this User. See {@link PoppyAgent.completeDirectSignIn}. */
    async completeDirectSignIn(callbackUrl) {
        const { user, scope } = await this.#agent.completeDirectSignIn(this.company, callbackUrl);
        if (user !== this)
            throw new PoppyProtocolError("the sign-in was started for another User");
        return { scope };
    }
    /**
     * Starts Device Sign-In (spec 4.3). Show the User the Company's name and domain with `verificationUri`
     * and `userCode`, then call {@link DeviceSignIn.wait}. Prefer Direct Sign-In when you can.
     */
    startDeviceSignIn(options) {
        return this.accountFor().startDevice(options);
    }
    /**
     * Mediated Sign-In (extension, transitional): signs in with credentials the User gave you for this
     * Company, chosen by its issuer. Prefer Direct or Device Sign-In whenever the Company offers them.
     */
    mediatedSignIn(options) {
        return this.accountFor().mediated(options);
    }
    /** Signs out (spec 5.5): revokes the refresh token. Sessions continue signed out. */
    async signOut() {
        if (this.#init.account === undefined)
            return;
        await this.#init.account.signOut();
        await this.#agent.dropPendingSignIns(this.company.identifier, this.#init.localUserId ?? "", this.#init.accountName ?? "default");
    }
}
//# sourceMappingURL=agent.js.map