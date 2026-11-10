import { completeSignIn } from "@/lib/agent";

// Direct Sign-In lands here with ?code&state&iss. Finish the exchange, then return to the playground.
export async function GET(req: Request) {
  try {
    await completeSignIn(req.url);
    return Response.redirect(new URL("/?signin=ok", req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.redirect(new URL(`/?signin=error&msg=${encodeURIComponent(msg)}`, req.url));
  }
}
