# Poppy Agent Playground

A Personal Agent for the **Personal Agent Protocol (Poppy)**. Point it at any Poppy Company and drive
the protocol end to end — discovery, a signed-out Session, Direct Sign-In on the Company's own page,
and signed-in API calls — with a live **Wire** panel that decodes every call (the per-request
`Poppy-Session` JWT, its delegation, and the `private_key_jwt` client assertion).

The agent self-hosts its own identity (CIMD) by default; you can switch to your own from the UI.

## Run

```bash
npm install
npm run dev     # http://127.0.0.1:5173
```

Open it and enter a Poppy Company's domain. For local dev against a self-signed stack, copy
`.env.example` to `.env.local`.

## Configure

Env vars — `.env.local` for local dev, project settings on Vercel.

| Var | Meaning |
| --- | --- |
| `POPPY_AGENT_URL` | This app's public URL (where the AS fetches its CIMD). |
| `POPPY_AGENT_KEY` | The agent's ES256 key (inline JWK). Generated if unset. |
| `POPPY_DEFAULT_COMPANY` | Optional prefill for the Company field. |
| `POPPY_CLIENT_ID` | Bring your own CIMD instead of self-hosting. |
| `POPPY_REDIRECT_URI` | Override the sign-in redirect (default `{origin}/callback`). |

## Deploy (Vercel)

The URL auto-detects; just set `POPPY_AGENT_KEY` to a fixed ES256 JWK (so every instance signs alike).
