/**
 * Rate-limit middleware factory (P0-6 — Schneier critical).
 *
 * Wraps a Hono handler in a CF Workers Rate Limit binding check. The
 * decision key is composed of the binding name + a request-derived value
 * (IP, agent JWT subject, or session user id, depending on the route).
 *
 * Why a factory (not a singleton middleware): different routes need different
 * keying strategies (anonymous routes key on IP, agent routes key on agent
 * id, session routes key on user id). The factory keeps the per-route
 * decision explicit at the call site.
 */

import { createMiddleware } from "hono/factory"
import type { Context } from "hono"
import type { Bindings, RateLimit } from "../auth.ts"
import type { AuthVariables } from "./auth.ts"

type LimiterName = "RL_AUTH" | "RL_PAIR" | "RL_MESSAGE" | "RL_A2A"

/**
 * Conservative Retry-After hint per limiter. CF's limit() API returns only
 * `{ success: boolean }` (no exact reset time), so we publish the upper
 * bound of the configured window in wrangler.toml. This lets HTTP clients
 * with RFC 6585 §4 awareness (Better Auth, well-behaved A2A SDKs, browsers
 * doing exponential backoff) avoid retry storms that would burn another
 * slot the moment the previous one closed.
 */
const RETRY_AFTER_SECONDS: Record<LimiterName, string> = {
  RL_AUTH: "10",
  RL_PAIR: "60",
  RL_MESSAGE: "60",
  RL_A2A: "60",
}

function rateLimitedResponse(c: Context, limiterName: LimiterName) {
  c.header("Retry-After", RETRY_AFTER_SECONDS[limiterName])
  return c.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait and try again.",
      },
    },
    429,
  )
}

/**
 * Best-effort client IP. CF Workers populates `cf-connecting-ip`; fall back
 * to a stable token so the limiter still applies a (relaxed) global cap
 * if the header is somehow absent.
 */
function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "no-ip"
  )
}

/** Build a rate-limit middleware keyed on the IP of the caller. */
export function rateLimitByIp(limiterName: LimiterName) {
  return createMiddleware<{ Bindings: Bindings; Variables: AuthVariables }>(
    async (c, next) => {
      const limiter = c.env[limiterName] as RateLimit | undefined
      if (!limiter) {
        // Binding not configured (e.g. local dev without rate limit binding):
        // fail open so dev/test still works. In prod the binding is always
        // present per wrangler.toml.
        await next()
        return
      }
      const key = `${limiterName}:ip:${clientIp(c)}`
      const { success } = await limiter.limit({ key })
      if (!success) {
        return rateLimitedResponse(c, limiterName)
      }
      await next()
    },
  )
}

/**
 * Build a rate-limit middleware keyed on the authenticated agent JWT subject.
 * Falls back to IP if the agent middleware hasn't populated agentId yet
 * (defense in depth: any unauth path should still get IP-rate-limited).
 */
export function rateLimitByAgent(limiterName: LimiterName) {
  return createMiddleware<{ Bindings: Bindings; Variables: AuthVariables }>(
    async (c, next) => {
      const limiter = c.env[limiterName] as RateLimit | undefined
      if (!limiter) {
        await next()
        return
      }
      const agentId = c.get("agentId")
      const key = agentId
        ? `${limiterName}:agent:${agentId}`
        : `${limiterName}:ip:${clientIp(c)}`
      const { success } = await limiter.limit({ key })
      if (!success) {
        return rateLimitedResponse(c, limiterName)
      }
      await next()
    },
  )
}
