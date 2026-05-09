import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types"
import * as schema from "./db/schema.ts"

export type Bindings = {
  DB: D1Database
  TENANT_HUB: DurableObjectNamespace
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  RESEND_API_KEY: string
  RESEND_FROM_EMAIL: string
  APP_URL: string
  PWA_URL: string
  JWT_SECRET: string
}

export function createAuth(env: Bindings, requestOrigin?: string) {
  const db = drizzle(env.DB, { schema })

  // Only enable a social provider when its credentials are real — wrangler dev
  // ships dummy values via .dev.vars to keep email/password flow testable.
  const isReal = (v: string | undefined) =>
    !!v && !v.startsWith("local-dummy") && !v.startsWith("dummy")

  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {}
  if (isReal(env.GOOGLE_CLIENT_ID) && isReal(env.GOOGLE_CLIENT_SECRET)) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }
  }
  if (isReal(env.GITHUB_CLIENT_ID) && isReal(env.GITHUB_CLIENT_SECRET)) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    }
  }

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    // baseURL must match the incoming request's origin so Better Auth resolves
    // the basePath correctly. In wrangler dev we pass http://localhost:8787;
    // in production we fall back to the configured hub URL.
    baseURL: requestOrigin ?? env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true },
    socialProviders,
    // In production: only the configured hub + PWA origins are trusted (CSRF).
    // In wrangler dev: also trust the localhost origin we're actually serving on,
    // otherwise Better Auth's CSRF check 403s sign-up calls.
    trustedOrigins: [
      env.APP_URL,
      env.PWA_URL,
      ...(requestOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(requestOrigin)
        ? [requestOrigin]
        : []),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
