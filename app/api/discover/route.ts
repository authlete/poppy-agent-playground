import { discoverFlow } from "@/lib/agent";
import { withSession } from "@/lib/handler";

export function POST(req: Request) {
  return withSession(req, async (ctx) => {
    const { website } = (await req.json().catch(() => ({}))) as { website?: string };
    if (!website) throw new Error("website is required");
    return discoverFlow(await ctx.agent(), ctx.session, ctx.wire, website);
  });
}
