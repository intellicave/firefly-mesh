import { useEffect, useState } from "react"
import { Smartphone, Loader, Trash2 } from "lucide-react"
import { Button } from "../ui/button.tsx"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Agent = {
  id: string
  displayName: string
  type: string
  createdAt: string
  lastSeenAt: string | null
}

export function DevicesPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await fetch(`${HUB_URL}/api/me/agents`, { credentials: "include" })
      if (cancelled) return
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in" : "Failed to load devices")
        setLoading(false)
        return
      }
      const body = (await res.json()) as { data: Agent[] }
      setAgents(body.data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRevoke(agentId: string) {
    if (!confirm("Revoke this device? It will no longer be able to send or receive messages.")) {
      return
    }
    setRevoking(agentId)
    const res = await fetch(`${HUB_URL}/api/agents/${agentId}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) {
      setAgents((prev) => prev.filter((a) => a.id !== agentId))
    } else {
      setError("Failed to revoke device")
    }
    setRevoking(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" strokeWidth={1.75} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Your devices</h1>
        <span className="text-xs text-muted-foreground">
          {agents.length} {agents.length === 1 ? "agent" : "agents"}
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col gap-5 rounded-lg border border-border p-6">
          <div className="flex items-start gap-3">
            <Smartphone className="h-8 w-8 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium">No agents connected</p>
              <p className="text-xs text-muted-foreground">
                Install the Firefly skill on any AI agent runtime to start sending and receiving messages.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <RuntimeCard
              label="OpenClaw / Claude Code"
              hint="Skill-based runtimes (agentskills.io v1). Recommended for most users."
              command="openclaw skill install firefly-mesh"
            />
            <RuntimeCard
              label="Claude Desktop / Cursor"
              hint="MCP-compatible clients. Add this to your settings.json:"
              command={`"firefly-mesh": { "command": "npx", "args": ["-y", "@firefly-mesh/mcp"] }`}
            />
            <RuntimeCard
              label="Anywhere else (HTTP)"
              hint="Any runtime that can call HTTP APIs. Pair via:"
              command="curl -X POST https://hub.firefly-mesh.com/api/agents/pair-init"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            All three modes use the same{" "}
            <code className="font-mono">/connect?code=…</code> pairing flow — no token pasting.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-medium">{a.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type} ·{" "}
                    {a.lastSeenAt
                      ? `last seen ${new Date(a.lastSeenAt).toLocaleString()}`
                      : "never connected"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRevoke(a.id)}
                disabled={revoking === a.id}
              >
                <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RuntimeCard({
  label,
  hint,
  command,
}: {
  label: string
  hint: string
  command: string
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // older browsers / non-https — ignore silently
    }
  }
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="block flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}
