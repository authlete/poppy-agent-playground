import { signInFlow } from "@/lib/agent";
import { withSession } from "@/lib/handler";
import { REDIRECT_URI } from "@/lib/config";

export function POST(req: Request) {
  return withSession(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as { website?: string; scope?: string[] };
    if (!body.website) throw new Error("website is required");
    const redirectUri = REDIRECT_URI ?? new URL("/callback", req.url).href;
    return signInFlow(await ctx.agent(), ctx.session, body.website, redirectUri, body.scope);
  });
}
