import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root — ensures Next traces deps from packages/* + workspace root
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Transpile workspace TS source directly (no separate build step in core).
  // W14 (defer W8): keep until sprint B deletes v0 server routes that import
  // @firefly-mesh/core. Removing now breaks `next dev` module resolution.
  transpilePackages: ["@firefly-mesh/core"],
  async rewrites() {
    return [
      // v0 original: /.well-known/* alias. Next can't have leading-dot folders.
      // W10: must keep — A2A protocol discovery endpoint, agents 404 without it.
      {
        source: "/.well-known/agent-card.json",
        destination: "/api/well-known/agent-card.json",
      },
      // W2': hub API proxy. Browser fetches same-origin /api/*, Next proxies to
      // hub. Avoids cross-origin cookie / CORS / SameSite nightmare. v0 server
      // routes (kept per AC4) still served by file system first; only paths
      // without a matching route.ts fall through to this rewrite.
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
