import { identityView } from "@/lib/agent";
import { withSession } from "@/lib/handler";

// Switch the agent's CIMD identity (bring-your-own, or revert to self-hosted). Either change invalidates
// the current sign-in — tokens are bound to the old client_id — so clear the store.
export function POST(req: Request) {
  return withSession(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as {
      clientId?: string;
      key?: string;
      reset?: boolean;
    };
    if (body.reset) {
      delete ctx.session.identity;
    } else {
      if (!body.clientId || !body.key) throw new Error("clientId and key are required");
      if (new URL(body.clientId).protocol !== "https:")
        throw new Error("client_id must be an https URL");
      const jwk = JSON.parse(body.key) as JsonWebKey & { kid: string };
      if (jwk.kty !== "EC" || !jwk.kid || !jwk.d)
        throw new Error("key must be a private EC JWK with a kid");
      ctx.session.identity = { clientId: body.clientId, jwk };
    }
    for (const k of Object.keys(ctx.session.store)) delete ctx.session.store[k];
    delete ctx.session.pendingWebsite;
    delete ctx.session.company;
    return { identity: identityView(ctx.session) };
  });
}
