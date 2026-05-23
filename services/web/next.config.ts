import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root — ensures Next traces deps from packages/* + workspace root
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Sprint B B.1: removed `transpilePackages: ["@firefly-mesh/core"]`. The
  // v0 server routes that imported @firefly-mesh/core are deleted; nothing
  // in services/web/ references that workspace package anymore.
  async rewrites() {
    return [
      // v0 original: /.well-known/* alias. Next can't have leading-dot folders.
      // W10: must keep — A2A protocol discovery endpoint, agents 404 without it.
      {
        source: "/.well-known/agent-card.json",
        destination: "/api/well-known/agent-card.json",
      },
      // W2': hub API proxy. Browser fetches same-origin /api/*, Next proxies to
      // hub. After sprint B B.1 all 41 v0 server routes are gone, so every
      // /api/* hits this rewrite (except the 2 retained FS routes:
      // /api/health and /api/well-known/agent-card.json).
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:8787"}/api/:path*`,
      },
    ];
  },
};

// W5'/W11: next-intl plugin wraps the config to inject the i18n/request.ts
// loader for getRequestConfig.
export default withNextIntl(nextConfig);
