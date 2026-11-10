import { jwksDocument } from "@/lib/agent";
import { HOSTS_OWN_CIMD } from "@/lib/config";

// The public key set referenced by the self-hosted CIMD document.
export async function GET() {
  if (!HOSTS_OWN_CIMD) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(await jwksDocument());
}
