import { useEffect, useRef, useState } from "react"
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

type WireDeliver = {
  op: "deliver"
  envelope: {
    messageId: string
    threadId?: string | null
    senderAgentId?: string | null
    type?: string
    summary?: string | null
    createdAt: string
  }
}

type Props = { tenant: string }

export function InboxPage({ tenant }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("closed")
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const tenantsRes = await fetch(`${HUB_URL}/api/tenants`, { credentials: "include" })
      if (cancelled) return
      if (!tenantsRes.ok) {
        setError(tenantsRes.status === 401 ? "Please sign in" : "Failed to load teams")
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

      const msgRes = await fetch(`${HUB_URL}/api/tenants/${found.id}/messages?limit=50`, {
        credentials: "include",
      })
      if (cancelled) return
      if (!msgRes.ok) {
        setError("Failed to load messages")
        setLoading(false)
        return
      }
      const msgBody = (await msgRes.json()) as { data: Message[] }
      setMessages(msgBody.data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tenant])

  useEffect(() => {
    if (!tenantId) return

    const wsUrl = HUB_URL.replace(/^http/, "ws") + `/ws?tenantId=${encodeURIComponent(tenantId)}`
    setWsState("connecting")
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setWsState("open")
    ws.onclose = () => setWsState("closed")
    ws.onerror = () => setWsState("closed")
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WireDeliver
        if (data.op !== "deliver") return
        const env = data.envelope
        const incoming: Message = {
          id: env.messageId,
          threadId: env.threadId ?? null,
          senderAgentId: env.senderAgentId ?? null,
          recipientAgentId: null,
          type: env.type ?? "inform",
          summary: env.summary ?? null,
          createdAt: env.createdAt,
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev
          return [incoming, ...prev]
        })
      } catch {
        // Ignore malformed frames
      }
    }

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: "ping" }))
    }, 30_000)

    return () => {
      clearInterval(pingInterval)
      ws.close()
      wsRef.current = null
    }
  }, [tenantId])

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

  const wsBadge =
    wsState === "open"
      ? <span className="text-xs text-green-600">Live</span>
      : wsState === "connecting"
        ? <span className="text-xs text-muted-foreground">Connecting...</span>
        : <span className="text-xs text-muted-foreground">Offline</span>

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <div className="flex items-center gap-3">
          {wsBadge}
          <span className="text-xs text-muted-foreground">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>
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
            href="/me/devices"
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
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium truncate">{m.senderAgentId ?? "—"}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                    {m.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {m.summary ?? "(no summary)"}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
