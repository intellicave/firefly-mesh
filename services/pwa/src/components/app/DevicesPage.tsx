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
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border px-6 py-12 text-center">
          <Smartphone className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium">No devices connected</p>
            <p className="text-xs text-muted-foreground">
              Run <span className="font-mono text-foreground">openclaw skill install firefly-mesh</span> to pair an agent
            </p>
          </div>
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
