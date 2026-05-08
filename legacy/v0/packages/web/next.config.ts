import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root — ensures Next traces deps from packages/* + workspace root
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Transpile workspace TS source directly (no separate build step in core)
  transpilePackages: ["@firefly-mesh/core"],
  // Serve /.well-known/* — Next can't have leading-dot folders, so we
  // alias to /api/well-known/*.
  async rewrites() {
    return [
      {
        source: "/.well-known/agent-card.json",
        destination: "/api/well-known/agent-card.json",
      },
    ];
  },
};

export default nextConfig;
