import { wireEntries } from "@/lib/wire";

export const dynamic = "force-dynamic";

export const GET = () => Response.json({ entries: wireEntries() });
