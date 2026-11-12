import { identityView } from "@/lib/agent";
import { json } from "@/lib/handler";
import { readSession } from "@/lib/session";
import { DEFAULT_COMPANY } from "@/lib/config";

// Initial client state: the agent's identity, the DPoP choice, and the optional Company prefill.
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return json(async () => {
    const session = await readSession(req);
    return { identity: identityView(session), dpop: session.dpop, defaultWebsite: DEFAULT_COMPANY };
  });
}
