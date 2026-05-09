// Root route — server-side smart redirect:
//   - Not signed in → /login
//   - Signed in but no employee record → /onboarding (will resolve correct step)
//   - Signed in + employee → /inbox

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@firefly-mesh/core/auth/better-auth";
import { db } from "@firefly-mesh/core/db";
import { employees } from "@firefly-mesh/core/db/schema";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) redirect("/login");

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, sess.user.id))
    .limit(1);

  if (!emp) redirect("/onboarding");
  redirect("/inbox");
}
