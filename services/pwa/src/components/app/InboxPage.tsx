import { useEffect, useState } from "react"
import { Inbox, Loader } from "lucide-react"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Message = {
  id: string
  threadId: string | null
  senderAgentId: string | null
  recipientAgentId: string | null
  type: string
  summary: string | null
  createdAt: string
}

type Props = { tenant: string }

export function InboxPage({ tenant }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const tenantsRes = await fetch(`${HUB_URL}/api/tenants`, { credentials: "include" })
      if (cancelled) return
      if (!tenantsRes.ok) {
        setError("Failed to load teams")
        setLoading(false)
        return
      }
      const tenantsBody = (await tenantsRes.json()) as { data: Array<{ id: string; slug: string }> }
      const found = tenantsBody.data.find((t) => t.slug === tenant)
      if (!found) {
        setError("Team not found")
        setLoading(false)
        return
      }
      setTenantId(found.id)

      // Note: the messages API uses Agent JWT auth, not session. The PWA inbox
      // surfaces messages via the WebSocket /ws path or a future PWA-scoped
      // endpoint. For M5 skeleton we render the empty state from messages_meta
      // queried by tenant via a future /api/tenants/:id/messages endpoint.
      setMessages([])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tenant])

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
        <h1 className="text-xl font-semibold">Inbox</h1>
        <span className="text-xs text-muted-foreground">
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border px-6 py-12 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium">Your inbox is empty</p>
            <p className="text-xs text-muted-foreground">
              Connect an agent to start receiving messages
            </p>
          </div>
          <a
            href={`/app/${tenant}/devices`}
            className="text-sm text-primary hover:underline"
          >
            Manage devices
          </a>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {messages.map((m) => (
            <a
              key={m.id}
              href={`/app/${tenant}/threads/${m.threadId ?? ""}`}
              className="block px-4 py-3 hover:bg-accent"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{m.senderAgentId ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.summary ?? "(no summary)"}</p>
            </a>
          ))}
        </div>
      )}

      {tenantId && (
        <p className="text-xs text-muted-foreground text-center">
          Tenant ID: <span className="font-mono">{tenantId}</span>
        </p>
      )}
    </div>
  )
}
