import { callFlow } from "@/lib/agent";
import { withSession } from "@/lib/handler";

export function POST(req: Request) {
  return withSession(req, async (ctx) => {
    const input = (await req.json().catch(() => ({}))) as {
      website?: string;
      url?: string;
      method?: string;
      body?: string;
      signedOut?: boolean;
    };
    if (!input.website || !input.url) throw new Error("website and url are required");
    return callFlow(await ctx.agent(), {
      website: input.website,
      url: input.url,
      method: input.method,
      body: input.body,
      signedOut: input.signedOut,
    });
  });
}
