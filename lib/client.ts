// Tiny typed wrappers over the JSON API.

export interface Envelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
  code?: string;
}

export async function post<T>(path: string, body?: unknown): Promise<Envelope<T>> {
  const res = await fetch(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  return res.json();
}

export async function get<T>(path: string): Promise<T> {
  return (await fetch(path, { cache: "no-store" })).json();
}
