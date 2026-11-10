import { getState } from "@/lib/agent";
import { json } from "@/lib/handler";

export const dynamic = "force-dynamic";

export const GET = () => json(getState);
