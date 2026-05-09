import type { DurableObjectState } from "@cloudflare/workers-types"
import type { Bindings } from "../auth.ts"

type WsAttachment = {
  kind: "agent" | "user"
  agentId: string | null
  tenantId: string
  userId: string
}

type InternalDeliverRequest = {
  recipientAgentId: string
  recipientUserId: string | null
  message: unknown
}

export class TenantHub {
  private state: DurableObjectState
  private env: Bindings

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request)
    }

    if (request.method === "POST" && url.pathname.endsWith("/internal/deliver")) {
      return this.handleDeliver(request)
    }

    return new Response("Not found", { status: 404 })
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const kindHeader = request.headers.get("X-Verified-Kind") ?? "agent"
    const agentId = request.headers.get("X-Verified-Agent-Id")
    const tenantId = request.headers.get("X-Verified-Tenant-Id")
    const userId = request.headers.get("X-Verified-User-Id")

    if (!tenantId || !userId) {
      return new Response("Unauthorized", { status: 401 })
    }

    const kind = kindHeader === "user" ? "user" : "agent"
    if (kind === "agent" && !agentId) {
      return new Response("Unauthorized: missing agentId for agent kind", { status: 401 })
    }

    const tag = kind === "agent" ? `agent:${agentId}` : `user:${userId}`

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server!, [tag])
    server!.serializeAttachment({
      kind,
      agentId: kind === "agent" ? agentId : null,
      tenantId,
      userId,
    } satisfies WsAttachment)

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as unknown as ResponseInit)
  }

  private async handleDeliver(request: Request): Promise<Response> {
    const { recipientAgentId, recipientUserId, message } =
      await request.json<InternalDeliverRequest>()

    const tags = [`agent:${recipientAgentId}`]
    if (recipientUserId) tags.push(`user:${recipientUserId}`)

    const seen = new Set<WebSocket>()
    let agentDelivered = false
    let userDelivered = false

    const payload = JSON.stringify({ op: "deliver", envelope: message })

    for (const tag of tags) {
      const sockets = this.state.getWebSockets(tag)
      for (const ws of sockets) {
        if (seen.has(ws)) continue
        seen.add(ws)
        try {
          ws.send(payload)
          if (tag.startsWith("agent:")) agentDelivered = true
          else userDelivered = true
        } catch {
          ws.close(1011, "Internal error")
        }
      }
    }

    return Response.json({
      delivered: agentDelivered || userDelivered,
      agentDelivered,
      userDelivered,
    })
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message)
    const data = JSON.parse(text) as { op: string }

    if (data.op === "ping") {
      _ws.send(JSON.stringify({ op: "pong" }))
    }
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string): void {
    // Hibernation handles socket lifecycle; no manual cleanup needed
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    ws.close(1011, "Internal error")
  }
}
