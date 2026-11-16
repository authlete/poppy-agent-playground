# Local patches to the vendored `@descope/poppy`

This is a vendored copy of the community `@descope/poppy` SDK (`dist` only). It carries local patches
applied directly to the compiled `dist`. Keep this file in sync with any change.

## 1. Persist access tokens (for stateless deployments)

**Why.** The SDK persists the refresh token and DPoP key to its `Store`, but keeps access tokens in
memory only (`Account#tokens`), assuming a long-lived agent. This playground is stateless — it builds
a fresh agent per request from a per-browser cookie `Store` (so it is correct across serverless
instances). With access tokens unpersisted, every signed-in call did a `refresh_token` grant, which
both wastes a round trip and, in a protocol-teaching tool, shows the **wrong** behaviour on the wire:
a correct agent mints an access token once and reuses it until it expires.

**What the patch does.** It persists access tokens into the account's stored state (so they ride in
the encrypted cookie) and restores them on `load()`, keyed by resource. The SDK's own expiry check
(`Date.now() < expiresAt - EXPIRY_MARGIN`) then decides reuse vs refresh — we do not re-implement it.
Only the default-scope token is persisted; narrowed lookups stay ephemeral. A token the resource
rejects (`invalid_token`) is dropped from the stored state too, so it is not restored next request.

Edits in `dist/account.js`, each marked `// PATCH`: `load()`, `#refresh()`, `invalidate()`,
`#dropAccount()`, `#complete()`.

**Effect on the wire:** sign in → one token → reused across calls → a real `refresh_token` grant only
when it actually expires.

## 2. Pushed Authorization Requests (PAR, RFC 9126 / Poppy 1.0 §4.2)

**Why.** Poppy 1.0 adds PAR: an agent MUST push when the Company requires it and SHOULD push whenever
the AS advertises `pushed_authorization_request_endpoint`, sending a DPoP proof so the code is bound to
the key, then open `/authorize` with only `client_id` + `request_uri`. The stock SDK builds the
authorize URL inline with no PAR.

**What the patch does.**
- `discovery.js`: parse `pushed_authorization_request_endpoint` + `require_pushed_authorization_requests`.
- `oauth.js`: `pushAuthorizationRequest(context, params, dpop)` — POSTs the authorize params + client
  assertion (+ DPoP proof) to the PAR endpoint, returns `request_uri`/`expires_in` (mirrors
  `tokenRequest`, same DPoP-nonce retry).
- `account.js:startDirect`: when the AS advertises the PAR endpoint, push, then open `/authorize` with
  only `client_id` + `request_uri`; otherwise the inline URL as before.

The push goes through the agent's instrumented fetch, so it shows in the sign-in wire.

## 3. Speak Poppy 1.0

**Why.** The vendored SDK predates Poppy 1.0 and only follows `0.3`, so it rejects a 1.0 Company —
including the deployed `stays.poppysandbox.dev` — at two points:

1. **Discovery.** `discover()` throws `protocol_version 1.0 is not supported`
   (`SUPPORTED_PROTOCOL_VERSIONS = ["0.3"]`). But the 1.0 `poppy.json` is read the same way the SDK
   already reads it: `organization.domain`, `auth.issuer`, `auth.scopes`, `auth.scope_hints`, and
   `apis` all map unchanged, and unknown fields (`supported_versions`) are ignored. The one 1.0
   addition that touches this flow — PAR — is the patch above.
2. **Per-request version (spec 3.4).** From 0.4 on, every request carrying the `Poppy-Session`
   header must also send `Poppy-Version`; a Company rejects one without it as `version_unsupported`
   (HTTP 400). The 0.3 SDK's `Session.fetch()` sends no such header, so even a signed-out read is
   rejected. DPoP-at-refresh, PS384, and richer consent are negotiated from authorization-server
   metadata, so they need no SDK change here.

**What the patch does.**

- `dist/discovery.js`: adds `"1.0"` to `SUPPORTED_PROTOCOL_VERSIONS`.
- `dist/session.js`: `Session.fetch()` sets `poppy-version` to the chosen document's
  `company.protocolVersion` alongside the `poppy-session` header (marked `// PATCH`), so a 0.3 and a
  1.0 Company each get their own version declared.

## TODO — upstream this

- [ ] After validating live (days/weeks), fork `descope/poppy-js`, port this change to the **TypeScript
      source** (not the compiled `dist`), add a test, and open an MR proposing optional access-token
      persistence for stateless/serverless deployments.
- Owner: Authlete (zulfiqar.ahmed@authlete.com)
