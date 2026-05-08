import { createAuthClient } from "better-auth/react"

const hubUrl = import.meta.env.PUBLIC_HUB_URL as string

export const authClient = createAuthClient({
  baseURL: hubUrl,
  basePath: "/api/auth",
})

export const { signIn, signUp, signOut, useSession } = authClient
