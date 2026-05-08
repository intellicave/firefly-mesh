// Better Auth config for firefly-mesh (M1-2).
// Provides authentication + organizations + RBAC via drizzle adapter.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { db } from "../db/index.ts";
import * as authSchema from "../db/schema/auth.ts";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET required (>=32 bytes base64). " +
      "See env-capabilities.yaml#better_auth_secret",
  );
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authSchema.user,
      session: authSchema.session,
      account: authSchema.account,
      verification: authSchema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
  },
  plugins: [organization()],
  secret,
  baseURL,
  trustedOrigins: [baseURL],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily on activity
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
