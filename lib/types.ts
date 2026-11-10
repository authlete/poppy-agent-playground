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
