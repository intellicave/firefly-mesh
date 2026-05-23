import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sprint B B.2: Cloudflare adapter config.
// Minimal default — no R2 incremental cache, no custom KV. ISR/SSG pages
// in this dashboard are zero (everything is dynamic per-user). When we
// add cached pages later (marketing route in B.5 may benefit), wire up
// `incrementalCache: r2IncrementalCache` here.
export default defineCloudflareConfig({});
