# Poppy Agent Playground

A Personal Agent for the **Personal Agent Protocol (Poppy)**. Point it at any Poppy Company and drive
the protocol end to end — discovery, a signed-out Session, Direct Sign-In on the Company's own page,
and signed-in API calls — with a live **Wire** panel that decodes every call (the per-request
`Poppy-Session` JWT, its delegation, and the `private_key_jwt` client assertion).

By default the app self-hosts its own agent identity (CIMD) at `/client-metadata.json`; from the UI
you can switch to any external CIMD (bring your own).

## Run

```bash
npm install
npm run dev     # http://127.0.0.1:5173
```

Copy `.env.example` to `.env.local` and set at least the Company and the agent key. The playground
needs the target Company, its authorization server, and its login UI reachable.

## Configure

| Var | Meaning |
| --- | --- |
| `POPPY_COMPANY` | Company website host — the discovery root. |
| `POPPY_PUBLIC_URL` | This app's public origin; self-hosts the CIMD at `{origin}/client-metadata.json`. |
| `POPPY_CLIENT_ID` | Bring your own CIMD URL instead of self-hosting. |
| `POPPY_AGENT_KEY` / `POPPY_AGENT_KEY_PATH` | ES256 signing key: inline JWK (prod) or file path (local). |
| `POPPY_REDIRECT_URI` | Direct Sign-In redirect; must be a registered redirect on the CIMD. |
| `POPPY_ALLOW_PRIVATE` | Allow loopback/private Company hosts. Local dev only. |
| `POPPY_DISABLE_DPOP` | Request Bearer tokens for a resource server that only validates Bearer. |

## Test

```bash
npm run e2e     # discover → signed-out → sign-in + consent → signed-in, incl. the decoded Session JWT
```

Drives a real browser through the Company's own login and consent; assumes the stack above is running.

## Deploy (Vercel)

Set the env vars (use `POPPY_AGENT_KEY` inline JWK; set `POPPY_PUBLIC_URL` to the deployment origin),
register `{origin}/callback` as a redirect on the CIMD, and leave the local-only flags unset.
