import { discover } from "@/lib/agent";
import { json } from "@/lib/handler";

export function POST(req: Request) {
  return json(async () => {
    const { website } = (await req.json().catch(() => ({}))) as { website?: string };
    return discover(website || undefined);
  });
}
