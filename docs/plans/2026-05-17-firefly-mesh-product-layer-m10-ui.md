# M10 — UI

> 极简（dashboard UI 推迟到 web 搬迁 sprint）。

## 涉及页面

| 页面 | API |
|---|---|
| `/(dashboard)/tasks` | GET /api/tasks + POST 创建 |
| `/(dashboard)/tasks/[id]` | GET /:id + POST start/submit/review |
| `/(dashboard)/inbox` (M11) | 加 task review 类型 |

## 关键交互

```
┌──────────────────────────────────────────────────────────┐
│ Tasks                          [+ New Task]              │
│ ─────────────────────────────────────────────────────── │
│ ◉ My (4)   Reviewing (2)   Created (3)   All            │
│                                                          │
│ Q3 spec draft        Bob → Alice  ● in_progress  Sep 1  │
│ Hire QA              Carol → David ● approved             │
│ Customer call notes  Bob → Bob/Alice 🚫(invalid: same)   │
│ Fix login bug        Alice → Bob   ● rejected (round 2) │
└──────────────────────────────────────────────────────────┘
```

详情 drawer 包括 timeline（状态转移历史，从 audit_log 还原）+ review comment 历史。

## 验收

web 搬迁后：

1. Carol create task → Bob 收到 inbox 通知（M11 inbox 显示 task review 类型）
2. Bob 看 → start → submit
3. Dave 在 inbox 看到 review 提示 → 点 approve/reject
4. reject + comment 后 Bob 看到 reject 原因 → 修改后再 submit → reviewRound=1
5. Approve 后任务进 approved 状态归档
