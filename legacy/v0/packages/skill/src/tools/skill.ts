// firefly.skill.* tools — load the org's effective skill set for this employee.

import { z } from "zod";

import type { ToolContext } from "./task.ts";

const LoadedInput = z.object({
  employeeId: z.string().uuid().optional(),
});

export const loaded = {
  name: "firefly.skill.loaded",
  description:
    "List the firefly-mesh skills active for this employee, with " +
    "Personal > Department > Company precedence already applied. " +
    "Use this on agent boot to know which org skills your runtime should expose.",
  inputSchema: LoadedInput,
  async handler(ctx: ToolContext, input: z.infer<typeof LoadedInput>) {
    return ctx.client.skill.loaded(input.employeeId);
  },
};

export const skillTools = [loaded];
