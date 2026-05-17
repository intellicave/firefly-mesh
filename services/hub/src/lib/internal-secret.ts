/**
 * Shared INTERNAL_SECRET placeholder guard — round-23 H fix.
 *
 * INTERNAL_SECRET is committed in wrangler.toml [vars] as a publicly-known
 * placeholder string (so local dev works without manual setup). The
 * placeholder is truthy, so a simple `if (!secret)` check accepts it as
 * valid. If production is accidentally deployed without running
 * `wrangler secret put INTERNAL_SECRET` the DO-internal auth would silently
 * use the placeholder — which anyone reading this repo can use to forge
 * X-Internal-Auth headers and impersonate the Worker to the DO (bypassing
 * HITL and impersonating arbitrary tenants/agents on WS upgrade).
 *
 * Strategy: the placeholder is acceptable ONLY when the request was received
 * on a loopback hostname (i.e. wrangler dev / miniflare). Production
 * deployments serve from hub.firefly-mesh.com (or any non-loopback host)
 * and there the placeholder is rejected with a 500 MISCONFIGURED.
 *
 * Both the Worker /ws path and the DO MUST call `isInternalSecretUsable`
 * before stamping / trusting X-Internal-Auth.
 */

export const INTERNAL_SECRET_PLACEHOLDER =
  "local-dev-placeholder-do-internal-rpc-override-via-wrangler-secret-in-prod"

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

export function isInternalSecretUsable(
  secret: string | undefined,
  request: Request,
): boolean {
  if (!secret) return false
  if (secret !== INTERNAL_SECRET_PLACEHOLDER) return true
  // Placeholder accepted only on the loopback interface (wrangler dev).
  // In production the host header is the custom domain; the placeholder is
  // rejected so a missing `wrangler secret put` does not silently expose
  // a publicly-known secret.
  const hostname = new URL(request.url).hostname
  return LOCAL_HOSTNAMES.has(hostname)
}
