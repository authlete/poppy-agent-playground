import { PoppyError } from "@descope/poppy";

/** Run an agent action and return a uniform JSON envelope. */
export async function json<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json({ ok: true, result: await fn() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const code = err instanceof PoppyError ? err.error : undefined;
    return Response.json({ ok: false, error, code });
  }
}
