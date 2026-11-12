import { withSession } from "@/lib/handler";

// Wipe this browser's session — sign out and drop its User IDs by clearing the whole encrypted cookie.
export function POST(req: Request) {
  return withSession(req, async (ctx) => {
    for (const k of Object.keys(ctx.session.store)) delete ctx.session.store[k];
    delete ctx.session.pendingWebsite;
    delete ctx.session.company;
    return {};
  });
}
