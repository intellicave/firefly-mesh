# product-layer M11+M12 — UI

> 不动 UI。本文档作为 web 搬迁 sprint 的契约预览。

## 涉及页面

| 页面 | API 消费 |
|---|---|
| `/inbox`（dashboard） | GET /api/a2a-messages/inbox + 4 HITL CTAs |
| `/audit`（dashboard，下个 sprint） | GET /api/audit（推到 audit-read sprint） |

## /inbox 关键交互

```
┌──────────────────────────────────────────────────────────┐
│  Inbox          [Approve(2)] [Action(5)]   Live ●        │
│ ───────────────────────────────────────────────────────  │
│  🟡 request  · alice-claude · "Q3 spec deadline?"        │
│      "Aug 25" · From Alice Liu, Engineering              │
│      [Accept] [Reject] [View thread]                     │
│                                                           │
│  🟣 handoff · bob-cursor · "prototype ready..."          │
│      From Bob Wei, Product                                │
│      [Accept] [Reject]                                    │
└──────────────────────────────────────────────────────────┘
```

- type 图标：⚪inform 🔵sync 🟡request 🟢commit 🟣handoff 🟠escalate 🔴block
- 摘要文本来自 a2a_messages.summary (非加密)
- 完整 body 加密 — 客户端 agent 解密后显示在 thread view (web 端实现时)

## audit_log 新字段的 UI

未来 `/audit` 页面用：
- `actor_type` → 三色标签（human=蓝，agent=绿，system=灰）
- `resource_type` → 资源类型筛选器
- `payload` → 行展开显示 diff / context

本 sprint 数据已就绪。
