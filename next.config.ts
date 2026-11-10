import type { NextConfig } from "next";

// Allow the public tunnel/deploy origin to reach the dev server (Next blocks cross-origin dev by default).
const publicHost = process.env.POPPY_AGENT_URL
  ? new URL(process.env.POPPY_AGENT_URL).host
  : undefined;

const nextConfig: NextConfig = {
  // The Poppy SDK is a Node-only ESM package (fetch + WebCrypto + Buffer). Keep it external so it
  // is loaded at runtime instead of bundled, and never pulled into a client or edge chunk.
  serverExternalPackages: ["@descope/poppy"],
  devIndicators: false,
  ...(publicHost ? { allowedDevOrigins: [publicHost] } : {}),
};

export default nextConfig;
