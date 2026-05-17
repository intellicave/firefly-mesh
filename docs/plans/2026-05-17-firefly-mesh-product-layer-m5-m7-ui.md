# product-layer M5-M7 — UI

> **本 sprint 不动 UI**。本文档极简，作为 web 搬迁 sprint 的契约预览。

---

## 1. 涉及的 dashboard 页面（待搬，下下个 sprint 实现）

| 页面 | 来源 | 本 sprint API 消费 |
|---|---|---|
| `/me/devices/:agentId` | legacy/v0/web/app/(dashboard)/settings/page.tsx 或新建 | GET/PUT /api/boundaries/:agentId（M6） |
| `/(dashboard)/agent-tokens` | 新建（v0 在 onboarding/tokens 下，迁出为独立 admin 页）| POST/GET/POST :id/regenerate/DELETE /api/agent-tokens（M7） |
| `/(dashboard)/organization?tab=employees` 行展开 | 已有 | 显示 agent.runtime_kind + activated_at（M5）|

## 2. 关键交互

### 2.1 Boundary 设置（M6）

```
┌────────────────────────────────────────────┐
│ alice-claude-desktop · Permissions          │
│ ─────────────────────────────────────────  │
│ Read                                         │
│   [x] read_kb         Read knowledge base    │
│ Write                                        │
│   [x] write_kb_personal                      │
│   [x] submit_task                            │
│ A2A                                          │
│   [x] send_a2a_inform                        │
│   [x] send_a2a_request   (HITL required)     │
│   [x] send_a2a_commit    (HITL required)     │
│   [x] send_a2a_handoff   (HITL required)     │
│ Action                                       │
│   [ ] dispatch_task      (manager/admin)     │
│   [ ] send_external_email  ⚠ DANGEROUS       │
│   [ ] sign_contract        ⚠ DANGEROUS       │
│                                              │
│ Changes apply on next JWT refresh (~90 day)  │
│                              [Cancel] [Save] │
└────────────────────────────────────────────┘
```

### 2.2 Agent Tokens（M7，admin only）

```
┌────────────────────────────────────────────┐
│ Agent Tokens                  [+ Issue new] │
│ ─────────────────────────────────────────  │
│ Employee     Status   Created    Expires    │
│ Alice        Pending  May 17     May 24     │ [Regenerate] [Revoke]
│ Bob          Consumed May 10     Jun 9      │ — bound to bob-cursor
│ Carol        Revoked  May 5      May 12     │ —
└────────────────────────────────────────────┘
```

新增 token 弹窗：
```
┌────────────────────────────────────────────┐
│ New Agent Token                             │
│                                              │
│ Employee:   [Alice ▾]                       │
│ Expires in: [7d ▾]                          │
│                                              │
│ ⚠ The token will be shown ONCE and cannot   │
│   be retrieved later. Save it before close. │
│                              [Cancel] [Issue]│
└────────────────────────────────────────────┘
```

签发后：
```
┌────────────────────────────────────────────┐
│ Token Issued                                 │
│                                              │
│ Token:  ftk_xxxxxxxxxxxxxxxxxxx [📋 Copy]   │
│ Expires: 2026-05-24T...                      │
│                                              │
│ Send this to Alice via email or 1Password.  │
│ It will be invalid after May 24.            │
│                                       [Close]│
└────────────────────────────────────────────┘
```

---

## 3. 验收（推迟到 web 搬迁 sprint）

dashboard 搬迁完毕后，以下用户流验收本 sprint API：

1. Alice 配 agent 后，dashboard `/me/devices` 看到 runtime 类型 + 激活时间
2. Carol 改 Alice agent 的 boundary，audit log 留痕
3. Carol 为 David 签 token，David 收到 plain 一次
4. Token regenerate 后旧的失效（status=revoked）

---
