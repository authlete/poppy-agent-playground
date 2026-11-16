# PAR in the Poppy Agent Playground — implementation spec

Enable Pushed Authorization Requests (RFC 9126) in the playground agent, and show it prominently, to
demonstrate the Poppy 1.0 / FAPI 2.0 path on Authlete. Pairs with the Stays/AS changes in the demo
handoff (`beirut/.context/blog-agentic-series/DEMO-HANDOFF-poppy-1.0-readiness.md`).

## What 1.0 requires (spec §4.2)

- A Company MAY require PAR via `require_pushed_authorization_requests: true` in its issuer metadata; it
  advertises `pushed_authorization_request_endpoint` when it supports it.
- The agent **MUST** push when required and **SHOULD** use PAR whenever the endpoint is listed: send the
  authorization request parameters to the PAR endpoint **with the client assertion** (private_key_jwt),
  and open `authorization_endpoint` with **only `client_id` + `request_uri`**.
- An agent that sends DPoP proofs **sends one with the pushed request too**, so the code is bound to the
  key. The `request_uri` expires after `expires_in`.

## UX decision: prominent, automatic (one action) — not a separate manual step

poppy-playground shows a real agent acting; a real agent does PAR → authorize with no human pause
(and the `request_uri` expires quickly). So keep sign-in as **one** action and surface PAR as a visible
automatic sub-step, rather than two manual buttons (the oauth-playground's manual-stepper model).

## Architecture principle: OAuth is ours; poppy-js is Poppy-only and disposable

PAR is an OAuth/FAPI feature, so it lives in **our own OAuth client**, never in the vendored SDK. The
vendored `poppy-js` is a throwaway and must touch only genuinely Poppy-specific things. Ownership:

| Ours (OAuth/FAPI client — the showcase)                                  | poppy-js (Poppy-only, disposable)               |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| `oauth-authorization-server` discovery, authorize request, **PAR**       | `poppy.json` discovery (domain↔issuer, apis, …) |
| token exchange (`authorization_code` + refresh), revocation              | per-request **Poppy-Session JWT** + delegation  |
| `private_key_jwt` assertions (ES256 **and** PS384), DPoP (incl. refresh) | CIMD envelope specifics                         |

Today the `PoppyAgent` does the whole OAuth flow, so realizing this is the same move as "own the OAuth
client" — the OAuth half of sign-in becomes ours (a clean client we control, ideally shared with the
oauth-playground), and poppy-js shrinks to the Poppy session layer. PAR is the first slice of that.

## Changes

### 1. Our OAuth client — add PAR to Direct Sign-In

In our OAuth sign-in code (not the vendored SDK):

- Read `pushed_authorization_request_endpoint` + `require_pushed_authorization_requests` from the AS
  metadata.
- Build the authorization parameters as today; then, when the AS advertises the PAR endpoint (use when
  offered) or requires it, **POST those params to the PAR endpoint** with:
  - the `private_key_jwt` client assertion (ES256/PS384), and
  - a DPoP proof when the issuer uses DPoP.
    Read `request_uri` + `expires_in`, and open `authorization_endpoint` with **only `client_id` +
    `request_uri`**. Fall back to the inline authorize URL when PAR is neither offered nor required.
- The PAR POST goes through the instrumented fetch, so it **appears in the sign-in wire automatically**.

### 2. Client UI (`app/page.tsx`, `components/WireLog.tsx`)

- **Sign-in step**: show a compact PAR panel — "Pushed authorization request → `request_uri`
  (expires in Ns) → opening authorization (client_id + request_uri only)".
- **WireLog**: decode the PAR POST request (client_assertion, DPoP proof, pushed params — the log
  already decodes `client_assertion` and DPoP) and summarize the response (`request_uri`, `expires_in`).

### 3. Poppy-Session JWT + delegation stays in poppy-js (unchanged)

Resource calls still carry the Poppy-Session header; that signing stays in the Poppy layer.

### 4. Stays Company + Authlete AS (separate repos — dependency, per handoff)

- Stays advertises `pushed_authorization_request_endpoint`; optionally set
  `require_pushed_authorization_requests: true` **only after** the agent supports PAR. AS/Company config,
  not the playground.

## Blog artifacts this produces

- A wire entry showing the **PAR push** (client assertion + DPoP proof) and the returned `request_uri`.
- The **authorize URL carrying only `client_id` + `request_uri`** — "nothing in the browser can change
  the request," the exact FAPI 2.0 line.

## Open questions

- Scope of "own the OAuth client": build it fresh in the playground, or reuse the oauth-playground's
  OAuth code (authorize/PAR/token/DPoP already exist there)? The latter is the convergence path.
- Toggle PAR on/off in the UI (like the DPoP toggle) to demo offered-vs-required, or always-on when the
  AS advertises it? Default: use when offered, no toggle, to keep the agent authentic.
