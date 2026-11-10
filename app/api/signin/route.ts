import { startSignIn } from "@/lib/agent";
import { json } from "@/lib/handler";
import { REDIRECT_URI } from "@/lib/config";

export function POST(req: Request) {
  return json(async () => {
    const body = (await req.json().catch(() => ({}))) as { scope?: string[] };
    const redirectUri = REDIRECT_URI ?? new URL("/callback", req.url).href;
    return startSignIn(redirectUri, body.scope);
  });
}
