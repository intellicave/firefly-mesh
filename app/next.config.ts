import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Sprint B B.3 option A (Vercel): deploy target is Vercel, not Cloudflare
// Workers. OpenNext + Windows had an unfixable runtime bug
// (`Dynamic require of /.next/server/middleware-manifest.json is not
// supported`) so we switched platforms. Hub stays on Cloudflare Workers
// (hub.firefly-mesh.com); web runs on Vercel and proxies /api/* to hub
// via the rewrites below.
//
// Output is plain Next (no standalone, no traceRoot tweaks) because
// Vercel handles deployment without an adapter layer.
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // W10: A2A protocol discovery endpoint. Next can't have leading-dot
      // folders, so /.well-known/agent-card.json must alias to a regular
      // path served by services/web/app/api/well-known/.
      {
        source: "/.well-known/agent-card.json",
        destination: "/api/well-known/agent-card.json",
      },
      // hub API proxy. Browser fetches same-origin /api/*, Next proxies
      // to hub. After sprint B B.1 all 41 v0 server routes are gone, so
      // every /api/* hits this rewrite (except the 2 retained FS routes:
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
