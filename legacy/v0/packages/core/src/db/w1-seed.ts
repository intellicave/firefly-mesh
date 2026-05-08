// W1 demo seed — creates one org, 1 CEO + 1 sales manager + 1 sales lead,
// and an active agent + JWT for the CEO so we can hit /api/task/dispatch
// with a real Bearer token.
//
// Run: tsx packages/core/src/db/w1-seed.ts > seed.json
// The output JSON has the URLs + tokens needed for the smoke test.

import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";

import { db } from "./index.ts";
import {
  agentTokens,
  agents,
  departmentMembers,
  departments,
  employees,
  organizations,
} from "./schema/index.ts";
import { signAgentJWT } from "../auth/jwt.ts";

async function main() {
  // Each run uses a fresh slug — no idempotency reset needed
  const slug = `w1-demo-${Date.now().toString(36)}`;

  const [org] = await db
    .insert(organizations)
    .values({ name: "W1 Demo Org", slug })
    .returning();
  if (!org) throw new Error("org insert returned nothing");

  // Departments
  const [salesDept] = await db
    .insert(departments)
    .values({ orgId: org.id, name: "Sales" })
    .returning();
  const [productDept] = await db
    .insert(departments)
    .values({ orgId: org.id, name: "Product" })
    .returning();
  if (!salesDept || !productDept) throw new Error("dept insert");

  // Employees
  const [ceo] = await db
    .insert(employees)
    .values({
      orgId: org.id,
      name: "Alice CEO",
      email: "alice@w1.demo",
      title: "CEO",
      role: "owner",
    })
    .returning();
  const [salesMgr] = await db
    .insert(employees)
    .values({
      orgId: org.id,
      name: "Bob Sales Mgr",
      email: "bob@w1.demo",
      title: "Sales Manager",
      role: "manager",
    })
    .returning();
  const [salesLead] = await db
    .insert(employees)
    .values({
      orgId: org.id,
      name: "Carol Sales Lead",
      email: "carol@w1.demo",
      title: "Sales Lead",
      role: "employee",
    })
    .returning();
  const [pm] = await db
    .insert(employees)
    .values({
      orgId: org.id,
      name: "Dave PM",
      email: "dave@w1.demo",
      title: "Product Manager",
      role: "manager",
    })
    .returning();
  if (!ceo || !salesMgr || !salesLead || !pm) throw new Error("emp insert");

  // Department membership
  await db.insert(departmentMembers).values([
    { departmentId: salesDept.id, employeeId: salesMgr.id, role: "head" },
    { departmentId: salesDept.id, employeeId: salesLead.id, role: "member" },
    { departmentId: productDept.id, employeeId: pm.id, role: "head" },
  ]);

  // Generate ed25519 key pair for CEO's agent
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyB64 = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  const privateKeyB64 = privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");

  const [ceoAgent] = await db
    .insert(agents)
    .values({
      orgId: org.id,
      ownerEmployeeId: ceo.id,
      publicKey: publicKeyB64,
      runtimeKind: "openclaw",
      runtimeMeta: { version: "2026.4.15", protocolVersion: "a2a/v1.2" },
      status: "active",
      activatedAt: new Date(),
    })
    .returning();
  if (!ceoAgent) throw new Error("agent insert");

  // Also activate agents for sales mgr + sales lead so handoffs route
  for (const e of [salesMgr, salesLead, pm]) {
    const kp = generateKeyPairSync("ed25519");
    const pk = kp.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    await db
      .insert(agents)
      .values({
        orgId: org.id,
        ownerEmployeeId: e.id,
        publicKey: pk,
        runtimeKind: "openclaw",
        runtimeMeta: { version: "2026.4.15", protocolVersion: "a2a/v1.2" },
        status: "active",
        activatedAt: new Date(),
      });
  }

  // Bearer JWT for CEO agent — 7-day TTL
  const allScopes = [
    "dispatch_task",
    "read_inbox",
    "send_message",
    "request_review",
    "send_handoff",
    "send_request",
    "send_commit",
    "send_inform",
    "send_sync",
    "send_block",
  ];
  const jwt = signAgentJWT({
    sub: ceoAgent.id,
    emp: ceo.id,
    org: org.id,
    scopes: allScopes,
    iat: Math.floor(Date.now() / 1000),
  });

  // Pre-issue a one-time token row so audits look real
  const oneTimePlain = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256")
    .update(oneTimePlain)
    .digest("base64url");
  await db.insert(agentTokens).values({
    orgId: org.id,
    employeeId: ceo.id,
    tokenHash,
    status: "consumed",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    consumedAt: new Date(),
    createdBy: ceo.id,
  });

  const out = {
    orgId: org.id,
    orgSlug: slug,
    employees: {
      alice: ceo.id,
      bob: salesMgr.id,
      carol: salesLead.id,
      dave: pm.id,
    },
    ceoAgent: { id: ceoAgent.id, jwt },
    privateKeyB64,
    departments: { sales: salesDept.id, product: productDept.id },
    oneTimePlainToken: oneTimePlain,
  };
  process.stdout.write(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
