// One-shot password reset using Better Auth's internal password.hash so
// the resulting hash is guaranteed compatible with the running auth ctx.
//
// Usage: tsx packages/core/src/db/reset-password.ts <email> <new-password>

import { eq } from "drizzle-orm";

import { auth } from "../auth/better-auth.ts";
import { db } from "./index.ts";
import { account, user } from "./schema/auth.ts";

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error("usage: reset-password.ts <email> <new-password>");
    process.exit(1);
  }

  const [u] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);
  if (!u) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(newPassword);

  const updated = await db
    .update(account)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(account.userId, u.id))
    .returning({ id: account.id });

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: u.email,
        userId: u.id,
        accountsUpdated: updated.length,
        newPassword,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
