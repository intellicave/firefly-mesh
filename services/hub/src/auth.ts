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
  JWT_SECRET: string
}

export function createAuth(env: Bindings) {
  const db = drizzle(env.DB, { schema })
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    trustedOrigins: [env.APP_URL],
  })
}

export type Auth = ReturnType<typeof createAuth>
