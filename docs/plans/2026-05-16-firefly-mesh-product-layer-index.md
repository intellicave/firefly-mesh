# firefly-mesh product-layer — 文档地图（index）

> 本 sprint 入口。系列前缀 `2026-05-16-firefly-mesh-product-layer-*`。
> 替代了 [edge sprint](2026-05-08-firefly-mesh-edge-index.md) 的"前端方向"（pwa-only），保留 edge 的"技术底座"（hub 现有 15 表 + 加密通信）。

## 1. 阅读路径

| 角色 | 读 |
|---|---|
| 新加入工程师 | [meta.md](2026-05-16-firefly-mesh-product-layer-meta.md) §3 反转决策 → [design.md](2026-05-16-firefly-mesh-product-layer-design.md) §2-4 schema/RBAC → [plan.md](2026-05-16-firefly-mesh-product-layer-plan.md) 当前 task → [rules.md](2026-05-16-firefly-mesh-product-layer-rules.md) |
| 产品/商业 | [ideation.md](2026-05-16-firefly-mesh-product-layer-ideation.md) 全篇 |
| 投资人 | [ideation.md](2026-05-16-firefly-mesh-product-layer-ideation.md) §1, §3, §5, §8.2 |
| 实施 reviewer | [plan.md](2026-05-16-firefly-mesh-product-layer-plan.md) §1 acceptance + §5 完成判定 + [api.md](2026-05-16-firefly-mesh-product-layer-api.md) |

## 2. 文档清单

| 文档 | 行数 | 角色 |
|---|---|---|
| [meta.md](2026-05-16-firefly-mesh-product-layer-meta.md) | ~180 | 决策反转记录 + 元规则 |
| [ideation.md](2026-05-16-firefly-mesh-product-layer-ideation.md) | ~270 | 用户画像 + MVP 模块清单 + 价值主张 |
| [design.md](2026-05-16-firefly-mesh-product-layer-design.md) | ~360 | schema + migration + RBAC + 中间件分层 |
| [ui.md](2026-05-16-firefly-mesh-product-layer-ui.md) | ~180 | UI ↔ API 契约预览（实施推迟到下个 sprint）|
| [api.md](2026-05-16-firefly-mesh-product-layer-api.md) | ~300 | 32 个新端点完整契约 |
| [plan.md](2026-05-16-firefly-mesh-product-layer-plan.md) | ~250 | 11 个 task acceptance_criteria + 后续 sprint 排期 |
| [rules.md](2026-05-16-firefly-mesh-product-layer-rules.md) | ~80 | 红线 + CI 检查 |
| [index.md](2026-05-16-firefly-mesh-product-layer-index.md) | ~80 | 本文 |

## 3. 关键决策速查

详见 [meta.md §5](2026-05-16-firefly-mesh-product-layer-meta.md#5-本-sprint-的关键决策不可重新讨论)。最常被质疑的：

| 决策 | 选 |
|---|---|
| 数据模型权威 | v0 产品语义 |
| 技术架构 | edge 现有底座（不改 D1-D8）|
| organizations 物理表 | 复用 tenants（API alias）|
| employees vs memberships | 并存：系统层 + 产品层 |
| 首 sprint 范围 | M1 org + M2 emp + M3 dept + M4 proj |

## 4. 模块清单（12 个 → 本 sprint 实施 4 个）

| # | 模块 | 状态 |
|---|---|---|
| M1 | organizations | 🚧 本 sprint |
| M2 | employees | 🚧 本 sprint |
| M3 | departments | 🚧 本 sprint |
| M4 | projects | 🚧 本 sprint |
| M5 | agents 重归属 | 📅 下 sprint |
| M6 | boundary | 📅 下 sprint |
| M7 | agent_tokens | 📅 V1.1 |
| M8 | knowledge | 📅 |
| M9 | skills | 📅 |
| M10 | tasks (HITL) | 📅 |
| M11 | a2a 产品层 | 📅 |
| M12 | audit 扩展 | 📅 |

后续 sprint 排期见 [plan.md §2](2026-05-16-firefly-mesh-product-layer-plan.md#2-后续-sprint-排期出-plan不实现)。

## 5. 跟历史 sprint 的关系

| sprint 系列 | 状态 | 引用 |
|---|---|---|
| `2026-04-28-firefly-mesh-*`（classic）| ❄️ 冻结 | 只作历史参考，不再加载 |
| `2026-05-07-firefly-mesh-scene-*`（scene 像素视图）| ❄️ 暂停 | scene 是独立线，不在本主线 |
| `2026-05-08-firefly-mesh-edge-*`（edge）| ✅ 部分上线 | 技术底座保留，§2.1/§3.2/§8 三处被本 sprint 反转 |
| `2026-05-16-firefly-mesh-product-layer-*` | 🚧 本 sprint | 当前主线 |

详见 [meta.md §3](2026-05-16-firefly-mesh-product-layer-meta.md#3-跟-edge-sprint-的关系决策反转-vs-决策保留)。
