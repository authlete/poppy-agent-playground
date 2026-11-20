// Shared, client-safe shapes (no server-only imports).

export interface CompanyView {
  name: string;
  domain: string;
  issuer: string;
  signIn: { direct: boolean; device: boolean; disabled: boolean };
  scopes: { name: string; description?: string; changes?: string; personalData?: boolean }[];
  apis: { type: string; url: string }[];
}

export interface Operation {
  method: string;
  path: string;
  url: string;
  summary?: string;
  scopes: string[];
  /** A JSON skeleton for the request body, built from the OpenAPI schema. */
  bodyExample?: string;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
}

/** One line in the left-pane agent transcript (what the User sees). */
export type AgentMsg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; text: string; data?: unknown; tone?: "ok" | "denied" | "info" };

/** A guided action the User can hand the agent. Derived from the Company's operations. */
export interface Task {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
  disabled?: boolean;
}

export interface WireEntry {
  id: string;
  seq: number;
  startedAt: number;
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  reqHeaders: Record<string, string>;
  reqBody?: Record<string, string>;
  poppySession?: DecodedJwt;
  delegation?: DecodedJwt;
  dpopProof?: DecodedJwt;
  clientAssertion?: DecodedJwt;
  respPreview?: string;
  error?: string;
}
