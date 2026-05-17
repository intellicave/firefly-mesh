# M8 + M9 — UI

> 不动 UI（dashboard 推 web 搬迁 sprint）。本文档作契约预览。

## Knowledge 页面（v0 已设计）

```
┌──────────────────────────────────────────────────────────┐
│  Knowledge                              [+ Upload]       │
│ ───────────────────────────────────────────────────────  │
│  [All] [Company] [Department ▾] [Personal]               │
│  ─────────────────────────────────────────────────────── │
│  🏢 Q3 product spec       md   12 chunks  ●ready  Sep 1  │
│  🏢 Employee handbook     md   45 chunks  ●ready         │
│  🏷 Eng coding standards  md   8 chunks  ●ready          │
│  📝 Alice's notes         txt  3 chunks  ●ready          │
└──────────────────────────────────────────────────────────┘
```

- scope 图标：🏢 company / 🏷 dept / 📝 personal
- 搜索框 → GET /api/knowledge/search → 跳转 docId

## Skills 页面（v0 已设计）

```
┌──────────────────────────────────────────────────────────┐
│  Skills                                 [+ Register]     │
│ ───────────────────────────────────────────────────────  │
│  scope: All ▾                                            │
│  ─────────────────────────────────────────────────────── │
│  🏢 firefly-mesh/email-draft       v1.0.0  ●active       │
│  🏷 acme/sales-playbook            v2.1.0  ●deprecated   │
│  📝 alice/my-helpers               v0.3.1  ●active       │
└──────────────────────────────────────────────────────────┘
```

assign 弹窗：列出当前 agent 列表 + checkbox（scope 校验后过滤）。
