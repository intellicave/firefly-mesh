// W1 demo — drive the approve-dispatch path without going through
// the cookie-protected route handler. Same SQL, same broker calls,
// same audit log writes.
//
// Usage: tsx packages/core/src/db/w1-approve.ts <rootTaskId>

import { and, eq } from "drizzle-orm";

import { db } from "./index.ts";
import { agents, employees, tasks } from "./schema/index.ts";
import { sendMessage } from "../a2a/broker.ts";
import { logAction } from "../audit/log.ts";
import { bus } from "../events/bus.ts";
import {
  routeSubTasks,
  type SubTask,
} from "../task/dispatcher.ts";

async function main() {
  const rootId = process.argv[2];
  if (!rootId) {
    console.error("usage: w1-approve.ts <rootTaskId>");
    process.exit(1);
  }

  const [rootTask] = await db
    .select({
      id: tasks.id,
      orgId: tasks.orgId,
      creatorEmployeeId: tasks.creatorEmployeeId,
      status: tasks.status,
      output: tasks.output,
    })
    .from(tasks)
    .where(eq(tasks.id, rootId))
    .limit(1);

  if (!rootTask) throw new Error("root task not found");
  if (rootTask.status !== "pending_dispatch_approval") {
    throw new Error(`unexpected status: ${rootTask.status}`);
  }

  const stored = (rootTask.output ?? {}) as { decomposition?: SubTask[] };
  const subtasks = stored.decomposition ?? [];
  if (subtasks.length === 0) throw new Error("decomposition empty");

  console.error(`> Routing ${subtasks.length} subtasks for org ${rootTask.orgId}`);
  const routed = await routeSubTasks(rootTask.orgId, subtasks);
  for (const r of routed) {
    console.error(
      `  - ${r.subtask.title.slice(0, 60)} → assignee=${r.assigneeEmployeeId ?? "(unassigned)"}`,
    );
  }

  const [senderAgent] = await db
    .select({ id: agents.id, publicKey: agents.publicKey })
    .from(agents)
    .where(
      and(
        eq(agents.ownerEmployeeId, rootTask.creatorEmployeeId),
        eq(agents.orgId, rootTask.orgId),
        eq(agents.status, "active"),
      ),
    )
    .limit(1);

  const result = await db.transaction(async (tx) => {
    const created: Array<{
      id: string;
      title: string;
      assigneeEmployeeId: string | null;
    }> = [];
    for (const r of routed) {
      const [t] = await tx
        .insert(tasks)
        .values({
          orgId: rootTask.orgId,
          parentId: rootId,
          rootId,
          creatorEmployeeId: rootTask.creatorEmployeeId,
          assigneeEmployeeId: r.assigneeEmployeeId,
          title: r.subtask.title,
          description: r.subtask.summary,
          status: r.assigneeEmployeeId ? "assigned" : "pending_dispatch_approval",
        })
        .returning({ id: tasks.id });
      if (!t) continue;
      created.push({
        id: t.id,
        title: r.subtask.title,
        assigneeEmployeeId: r.assigneeEmployeeId,
      });
    }
    await tx
      .update(tasks)
      .set({ status: "assigned", updatedAt: new Date() })
      .where(eq(tasks.id, rootId));
    return { created };
  });

  let handoffsSent = 0;
  let handoffsSkipped = 0;
  if (senderAgent) {
    for (const child of result.created) {
      if (!child.assigneeEmployeeId) {
        handoffsSkipped++;
        continue;
      }
      const sent = await sendMessage({
        orgId: rootTask.orgId,
        senderAgentId: senderAgent.id,
        senderEmployeeId: rootTask.creatorEmployeeId,
        senderSignature: "system_dispatch",
        receiverEmployeeId: child.assigneeEmployeeId,
        type: "handoff",
        content: {
          summary: child.title,
          structured: { taskId: child.id, parentTaskId: rootId },
        },
        relatedTaskId: child.id,
      });
      if (sent.ok) handoffsSent++;
      else handoffsSkipped++;
    }
  } else {
    console.error("(no sender agent — skipping handoffs)");
  }

  await logAction({
    orgId: rootTask.orgId,
    actorType: "human",
    actorId: rootTask.creatorEmployeeId,
    action: "task.dispatch_approved",
    resourceType: "task",
    resourceId: rootId,
    payload: {
      childCount: result.created.length,
      handoffsSent,
      handoffsSkipped,
    },
  });
  bus.publish(`audit.org.${rootTask.orgId}`, "task.dispatched", {
    rootTaskId: rootId,
    childCount: result.created.length,
  });

  // Resolve assignee names for human-readable output
  const assigneeIds = result.created
    .map((c) => c.assigneeEmployeeId)
    .filter((x): x is string => Boolean(x));
  const empNames =
    assigneeIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await db
              .select({ id: employees.id, name: employees.name })
              .from(employees)
              .where(eq(employees.orgId, rootTask.orgId))
          ).map((e) => [e.id, e.name] as const),
        );

  process.stdout.write(
    JSON.stringify(
      {
        rootTaskId: rootId,
        childCount: result.created.length,
        handoffsSent,
        handoffsSkipped,
        children: result.created.map((c) => ({
          id: c.id,
          title: c.title,
          assignee: c.assigneeEmployeeId
            ? `${empNames.get(c.assigneeEmployeeId) ?? "?"} (${c.assigneeEmployeeId.slice(0, 8)})`
            : "(unassigned)",
        })),
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
