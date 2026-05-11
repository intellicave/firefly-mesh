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

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Critical: a single malformed frame from ANY connected client must not
    // throw out of this handler — under CF hibernated WebSocket DO model an
    // unhandled exception kills the entire isolate, which simultaneously
    // closes every other socket attached to this tenant. So we hard-isolate
    // each frame: parse defensively, drop the offending socket with a clean
    // close code (1008 = policy violation), keep the rest alive.
    let data: unknown
    try {
      // fatal:true so non-UTF8 binary frames throw at decode time rather than
      // producing replacement-character soup that the JSON parser then chokes on
      const text =
        typeof message === "string"
          ? message
          : new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(message)
      data = JSON.parse(text)
    } catch {
      try { ws.close(1008, "Invalid frame") } catch { /* socket already closing */ }
      return
    }

    if (typeof data !== "object" || data === null || typeof (data as { op?: unknown }).op !== "string") {
      try { ws.close(1008, "Invalid frame shape") } catch { /* socket already closing */ }
      return
    }

    const op = (data as { op: string }).op
    if (op === "ping") {
      try { ws.send(JSON.stringify({ op: "pong" })) } catch { /* peer gone */ }
    }
    // unknown ops are silently ignored (forward-compat with future client versions)
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string): void {
    // Hibernation handles socket lifecycle; no manual cleanup needed
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    // Same isolate-crash guard as webSocketMessage: if the socket is already
    // closing, ws.close() throws and would propagate — killing every other
    // socket on this DO. Swallow it.
    try { ws.close(1011, "Internal error") } catch { /* already closing */ }
  }
}
