import { defineConfig } from "@playwright/test"

// Sprint B B.6: prod-target e2e. BASE_URL points to the live Vercel
// deployment (or to firefly-mesh.com once DNS is migrated). No local dev
// server — these tests probe the deployed surface, not the source.
//
// Override:
//   FIREFLY_BASE_URL=https://firefly-mesh.com pnpm test:e2e:web
const BASE_URL =
  process.env.FIREFLY_BASE_URL ??
  "https://firefly-mesh-8mi0c8a0m-ohbabytriples-projects.vercel.app"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    extraHTTPHeaders: {
      "User-Agent": "firefly-mesh-e2e/1.0",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
