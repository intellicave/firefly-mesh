import type { DurableObjectState } from '@cloudflare/workers-types'

/**
 * TenantHub — Durable Object stub.
 * M2: Implement tenant coordination logic (presence, session routing, WebSocket hub).
 */
export class TenantHub {
  private readonly state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  fetch(request: Request): Response {
    return new Response(
      JSON.stringify({ error: 'not_implemented', hint: 'TenantHub is a M2 feature' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
