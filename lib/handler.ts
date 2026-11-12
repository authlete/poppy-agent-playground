import { PoppyError } from "@descope/poppy";
import { buildAgent } from "./agent";
import { readSession, sessionCookie, RecordStore, type SessionData } from "./session";
import { Wire } from "./wire";

export interface Ctx {
  req: Request;
  session: SessionData;
  wire: Wire;
  agent: () => ReturnType<typeof buildAgent>;
}

/** Run a stateless agent action: decrypt the session cookie, run `fn`, then write the updated cookie
 *  back and return `{ ok, result, wire }` (the browser accumulates the wire). */
export async function withSession<T>(
  req: Request,
  fn: (ctx: Ctx) => Promise<T>,
): Promise<Response> {
  const session = await readSession(req);
  const before = JSON.stringify(session);
  const wire = new Wire();
  const store = new RecordStore(session.store);
  let agent: ReturnType<typeof buildAgent> | undefined;
  const ctx: Ctx = {
    req,
    session,
    wire,
    agent: () => (agent ??= buildAgent(store, session, wire)),
  };

  let body: Record<string, unknown>;
  try {
    body = { ok: true, result: await fn(ctx) };
  } catch (err) {
    body = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: err instanceof PoppyError ? err.error : undefined,
    };
  }
  await wire.settle();
  const res = Response.json({ ...body, wire: wire.entries });
  // Only set the cookie when the session actually changed, so a slow request reading stale state
  // can't clobber a concurrent write (e.g. an auto-discover overwriting a just-started sign-in).
  if (JSON.stringify(session) !== before)
    res.headers.set("Set-Cookie", await sessionCookie(session));
  return res;
}

/** A plain JSON envelope for routes with no session (static config, hosted documents). */
export async function json<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json({ ok: true, result: await fn() });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: err instanceof PoppyError ? err.error : undefined,
    });
  }
}
