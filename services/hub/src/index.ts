import { Hono } from 'hono'
import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'
import { TenantHub } from './tenant-hub'

type Bindings = {
  DB: D1Database
  TENANT_HUB: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.json({ status: 'ok', version: '0.1.0' })
})

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Bindings>

// Re-export DO class so Wrangler can register it from this module
export { TenantHub }
