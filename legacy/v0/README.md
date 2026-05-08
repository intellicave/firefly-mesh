# firefly-mesh classic (v0) — 归档

> **状态**：已冻结。仅作历史参考，不再迭代。
> **归档日期**：2026-05-09
> **归档原因**：firefly-mesh edge 重新设计（Cloudflare Workers + DO + D1 + E2E 加密）
>
> 活跃开发请看 [edge 文档系列](../../docs/plans/2026-05-08-firefly-mesh-edge-index.md)。

## 包含内容

- `packages/core/` — 原 Next.js 全栈核心（A2A、HITL、audit、Better Auth、Drizzle/Postgres）
- `packages/mcp/` — 原 MCP adapter
- `packages/sdk/` — 原 SDK（A2A 客户端）
- `packages/skill/` — 原 OpenClaw skill（agentskills.io v1）
- `packages/web/` — 原 Next.js dashboard
- `deploy/` — 原 Docker Compose 部署配置
- `Dockerfile` — 原 Docker 构建文件

## 对照关系

| classic | edge | 状态 |
|---------|------|------|
| packages/core/src/a2a/protocol.ts | packages/proto/src/a2a-wire.ts | 直接 copy + 扩展 |
| packages/core/src/a2a/signing.ts | packages/proto/src/signing.ts | copy + 换底层库 |
| packages/core/src/a2a/broker.ts | services/hub/src/durable-objects/TenantHub.ts | 概念保留，实现重写 |
| packages/core/src/hitl/engine.ts | services/hub/src/hitl/engine.ts | 概念保留，实现重写 |
| packages/skill/ | packages/client/ | 重写 |
| packages/mcp/ | packages/client/src/adapters/mcp.ts | 合并 |
| packages/web/ | services/pwa/ | 重写（Astro） |
