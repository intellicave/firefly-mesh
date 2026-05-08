// Shared TanStack Query key constants used by both scene page and data bridge.

export const QUERY_KEYS = {
  me: ["me"] as const,
  orgGraph: ["org-graph"] as const,
  taskList: ["task-list"] as const,
  a2aInbox: ["a2a-inbox"] as const,
} as const;
