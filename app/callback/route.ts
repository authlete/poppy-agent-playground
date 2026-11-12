import { buildAgent, completeFlow } from "@/lib/agent";
import { readSession, sessionCookie, RecordStore } from "@/lib/session";
import { Wire } from "@/lib/wire";

// Direct Sign-In lands here with ?code&state&iss. Finish the exchange against this browser's session,
// persist the new refresh token to the cookie, then return to the playground.
export async function GET(req: Request) {
  const session = await readSession(req);
  const agent = await buildAgent(new RecordStore(session.store), session, new Wire());

  // Relative Location so the browser stays on the exact host it signed in from (127.0.0.1 vs localhost,
  // or a Vercel alias): a host-only session cookie set here is only sent back to that same host.
  let location = "/?signin=ok";
  try {
    await completeFlow(agent, session, req.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    location = `/?signin=error&msg=${encodeURIComponent(msg)}`;
  }
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Set-Cookie": await sessionCookie(session) },
  });
}
