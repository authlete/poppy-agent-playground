import { setDpop } from "@/lib/agent";
import { json } from "@/lib/handler";

export function POST(req: Request) {
  return json(async () => {
    const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: boolean };
    return setDpop(enabled !== false);
  });
}
