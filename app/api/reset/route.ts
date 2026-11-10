import { reset } from "@/lib/agent";
import { json } from "@/lib/handler";

export const POST = () => json(reset);
