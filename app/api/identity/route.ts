import { clearIdentity, setIdentity } from "@/lib/agent";
import { json } from "@/lib/handler";

export function POST(req: Request) {
  return json(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      clientId?: string;
      key?: string;
      reset?: boolean;
    };
    if (body.reset) return clearIdentity();
    if (!body.clientId || !body.key) throw new Error("clientId and key are required");
    return setIdentity(body.clientId, body.key);
  });
}
