# Web Migration A — 文档地图

> hub 后端 12/12 done 之后的第一个前端 sprint。

## 阅读路径

| 角色 | 读 |
|---|---|
| 新工程师 | [design.md](2026-05-18-firefly-mesh-web-migration-a-design.md) §2-3 + [plan.md](2026-05-18-firefly-mesh-web-migration-a-plan.md) |
| reviewer | 本 [plan.md §1](2026-05-18-firefly-mesh-web-migration-a-plan.md) acceptance + [rules.md Z-AC](2026-05-18-firefly-mesh-web-migration-a-rules.md) |

## 文档清单

| 文档 | 角色 |
|---|---|
| [meta.md](2026-05-18-firefly-mesh-web-migration-a-meta.md) | W1-W6 决策 + 铁律 |
| [ideation.md](2026-05-18-firefly-mesh-web-migration-a-ideation.md) | sprint 范围 + 用户故事 + 风险 |
| [design.md](2026-05-18-firefly-mesh-web-migration-a-design.md) | fetch / auth base URL 改动 + CORS + cookie + workspace 集成 |
| [ui.md](2026-05-18-firefly-mesh-web-migration-a-ui.md) | UI 继承（不动）+ i18n 接入 + 已知 gap |
| [api.md](2026-05-18-firefly-mesh-web-migration-a-api.md) | 零新 endpoint + v0 ↔ hub 路径映射 |
| [plan.md](2026-05-18-firefly-mesh-web-migration-a-plan.md) | 10 task + acceptance + 风险 |
| [rules.md](2026-05-18-firefly-mesh-web-migration-a-rules.md) | Z (不动 hub) / AA (fetch 模式) / AB (不加 dep) / AC (do-not-touch) |
| [index.md](2026-05-18-firefly-mesh-web-migration-a-index.md) | 本文 |

## sprint A → B → go-live 三步

| Sprint | 状态 | 估时 | 内容 |
|---|---|---|---|
| **web migration A** | 🚧 本 | 1 天 | cp + fetch 重定向 + i18n + dev 跑通 |
| web migration B | 📅 | 1 天 | 删 45 v0 server routes + Pages 部署 + cookieDomain prod + 删 pwa + E2E |
| go-live | 📅 | 1-2 天 | Stripe + 法律 + Sentry + 营销 + soft launch |

## 核心简化点

v0 dashboard 14 page.tsx **都不直接 import @firefly-mesh/core** —— 全部通过 `api()` helper 调 `/api/*`。所以"对接 hub"实际只是**改 2 行**（api-client base URL + auth-client baseURL）。Sprint A 的工作集中在这两处改动 + 解 workspace deps + i18n 抢救 + smoke test。
