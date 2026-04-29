import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root — ensures Next traces deps from packages/* + workspace root
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
