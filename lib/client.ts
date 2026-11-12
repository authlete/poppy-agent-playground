// Tiny typed wrappers over the JSON API.
import type { WireEntry } from "./types";

export interface Envelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
  code?: string;
  /** HTTP calls the agent made serving this request; the client accumulates them into the wire log. */
  wire?: WireEntry[];
}

// The session lives in one cookie, so two in-flight writes would lose an update (a slow auto-discover
// overwriting a just-started sign-in). Serialize posts so the agent only ever mutates it one at a time.
let chain: Promise<unknown> = Promise.resolve();

export function post<T>(path: string, body?: unknown): Promise<Envelope<T>> {
  const run = chain.then(() =>
    fetch(path, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }).then((res) => res.json() as Promise<Envelope<T>>),
  );
  chain = run.catch(() => {});
  return run;
}

export async function get<T>(path: string): Promise<T> {
  return (await fetch(path, { cache: "no-store" })).json();
}
