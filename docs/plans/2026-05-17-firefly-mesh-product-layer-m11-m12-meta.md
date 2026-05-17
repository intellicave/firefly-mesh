# product-layer M11+M12 — Meta

> Delta-only。沿用 [2026-05-16](2026-05-16-firefly-mesh-product-layer-meta.md) P1-P8 + [2026-05-17 M5-M7](2026-05-17-firefly-mesh-product-layer-m5-m7-meta.md) P9-P12。

## 关系链

| sprint | 关系 |
|---|---|
| 2026-05-16 M1-M4 | ✅ |
| 2026-05-17 M5-M7 | ✅ |
| **2026-05-17 M11-M12**（本 sprint） | 🚧 |
| 2026-05-?? M10 (tasks + HITL) | 📅 |
| 2026-05-?? M8 + M9 (knowledge + skills) | 📅 |
| ... web 搬迁 / 上线 | 📅 |

## 新增决策 P13-P17

| ID | 决策 | 理由 |
|---|---|---|
| **P13** | 产品层 `a2a_messages` 通过 `encrypted_message_id` 引用 hub `messages_meta`；两层独立 | 不破坏加密层 D2；不污染加密元数据 |
| **P14** | `a2a_messages.summary` 不存（直接读 messages_meta.summary）；客户端 sender 明文写 summary（非加密） | 减少冗余；admin 可在 inbox 看到预览（v0 行为） |
| **P15** | 产品层 thread (`a2a_threads`) 跟加密层 thread (`threads`) 独立；前者含 topic + relatedTaskId，后者含 participants list | 解耦：产品语义 vs 加密会话 |
| **P16** | WS 主动推送依赖 hub 现有对 messages_meta 的推送；不为产品层加专用 WS 事件 | 范围控制；推送已可工作 |
| **P17** | audit_log 4 列 ALTER 全部可空；target_id 保留向后兼容；retrofit 11 处但旧行不动 | 渐进升级 |

## 不可破坏

- 沿用上 sprint 边界
- 新增：禁止 client 自报 HITL 完成（rules.md R9 — server-side state machine 唯一权威）
- 新增：禁止 client 写 audit_log（只能通过 writeAudit helper 间接 — sender server-side）
