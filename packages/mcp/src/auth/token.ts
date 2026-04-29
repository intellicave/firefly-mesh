// MCP token resolution. We accept the firefly-mesh JWT in two ways:
//   1) FIREFLY_MESH_TOKEN env var (most common — set in mcp.json config).
//   2) FIREFLY_MESH_BASE_URL + FIREFLY_MESH_ONE_TIME_TOKEN env vars
//      → calls /api/agent/activate on first run.
//
// The MCP server stores the resulting JWT in process memory only —
// the runtime restarts the server on each session, so persistence
// is delegated to the user's mcp.json or an external secret store.

export interface ResolvedAuth {
  baseUrl: string;
  jwt: string;
}

export function resolveAuthFromEnv(): ResolvedAuth {
  const baseUrl = process.env.FIREFLY_MESH_BASE_URL;
  const jwt = process.env.FIREFLY_MESH_TOKEN;
  if (!baseUrl) {
    throw new Error(
      "FIREFLY_MESH_BASE_URL env var is required (e.g. https://mesh.acme.io)",
    );
  }
  if (!jwt) {
    throw new Error(
      "FIREFLY_MESH_TOKEN env var is required (the agent JWT from /api/agent/activate). " +
        "Run the activation flow once and put the returned jwt in your mcp.json config.",
    );
  }
  return { baseUrl, jwt };
}
