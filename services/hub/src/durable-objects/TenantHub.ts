import type { DurableObjectState } from "@cloudflare/workers-types"
import type { Bindings } from "../auth.ts"

type WsAttachment = { agentId: string; tenantId: string; userId: string }

type InternalDeliverRequest = {
  agentId: string
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
    const agentId = request.headers.get("X-Verified-Agent-Id")
    const tenantId = request.headers.get("X-Verified-Tenant-Id")
    const userId = request.headers.get("X-Verified-User-Id")

    if (!agentId || !tenantId || !userId) {
      return new Response("Unauthorized", { status: 401 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server!, [agentId])
    server!.serializeAttachment({ agentId, tenantId, userId } satisfies WsAttachment)

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as unknown as ResponseInit)
  }

  private async handleDeliver(request: Request): Promise<Response> {
    const { agentId, message } = await request.json<InternalDeliverRequest>()

    const sockets = this.state.getWebSockets(agentId)
    if (sockets.length > 0) {
      const payload = JSON.stringify({ op: "deliver", envelope: message })
      for (const ws of sockets) {
        try {
          ws.send(payload)
        } catch {
          ws.close(1011, "Internal error")
        }
      }
      return Response.json({ delivered: true })
    }

    return Response.json({ delivered: false })
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
