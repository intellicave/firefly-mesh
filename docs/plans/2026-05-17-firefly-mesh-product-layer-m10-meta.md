# M10 — Meta

> Delta-only。沿用 P1-P17 + edge D1-D8。

## 关系链

| sprint | 状态 |
|---|---|
| 2026-05-16 M1-M4 | ✅ |
| 2026-05-17 M5-M7 | ✅ |
| 2026-05-17 M11-M12 | ✅ |
| **2026-05-17 M10**（本 sprint）| 🚧 |
| 2026-05-?? M8 (knowledge) | 📅 |
| 2026-05-?? M9 (skills) | 📅 |
| ... web-migration / launch | 📅 |

## 新增决策 P18-P21

| ID | 决策 | 理由 |
|---|---|---|
| **P18** | 任务创建直接 'assigned'，跳过 pending_dispatch_approval | LLM dispatch 是 V1.1，简化主流程 |
| **P19** | reviewer 必填 + assignee ≠ reviewer（创建期硬约束）| 防自批；显式胜过隐式 |
| **P20** | 不自动创建关联 a2a_message | session create 没 agent context；V1.1 wire |
| **P21** | submit 支持 session + agent JWT 双路径 | v0 行为：employee 本人或其 agent 都可提交 |

## 不可破坏

- 沿用全部前 sprint 红线
- 新增：禁止 assignee review 自己的任务（即使 admin/owner 创建时也不能让 assignee=reviewer；admin 越过 review 是另外一回事）
