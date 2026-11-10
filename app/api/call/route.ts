import { callApi } from "@/lib/agent";
import { json } from "@/lib/handler";

export function POST(req: Request) {
  return json(async () => {
    const input = (await req.json().catch(() => ({}))) as {
      url?: string;
      method?: string;
      body?: string;
      signedOut?: boolean;
    };
    if (!input.url) throw new Error("url is required");
    return callApi({ url: input.url, method: input.method, body: input.body, signedOut: input.signedOut });
  });
}
