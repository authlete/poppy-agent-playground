import { jwksDocument } from "@/lib/agent";
import { SELF_HOSTED } from "@/lib/config";

// The public key set referenced by the self-hosted CIMD document.
export async function GET() {
  if (!SELF_HOSTED) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(await jwksDocument());
}
