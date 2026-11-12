import { withSession } from "@/lib/handler";

export function POST(req: Request) {
  return withSession(req, async (ctx) => {
    const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: boolean };
    ctx.session.dpop = enabled !== false;
    return { dpop: ctx.session.dpop };
  });
}
