# Web Migration A — Meta

> 第一个非后端 sprint。沿用 P1-P29 + edge D1-D8 + 全部 rules.md A-Y。

## 关系链

| sprint | 状态 |
|---|---|
| hub 后端 M1-M12 | ✅ 全部完成 (5 sprint, 2026-05-16~18) |
| **web migration A** | 🚧 本 sprint |
| web migration B | 📅 next |
| go-live | 📅 next next |

## 新增决策 W1-W6（与 design.md §7 一致）

| ID | 决策 |
|---|---|
| **W1** | sprint A 不删 v0 server route（推 sprint B）|
| **W2** | api-client fetch 用绝对 URL prefix（不用 Next rewrites） |
| **W3** | services/web 独立依赖版本，不向上提升 |
| **W4** | dev 时改 hub .dev.vars，不改 hub 源码 |
| **W5** | i18n 继承 v0/pwa 客户端 Zustand 模型，不换 next-intl |
| **W6** | cookieDomain 配置推 sprint B |

## 不可破坏（铁律）

- **hub 一行不动**（git diff services/hub 必须空）
- 不删 legacy / 不删 services/pwa
- 不部署 prod
- 不引入新依赖（v0 已有 deps 全部保留即可）

## 跟先前 sprint 的接口

- 调用 hub ~80 个 endpoint —— 见 [api.md §2 调用映射](2026-05-18-firefly-mesh-web-migration-a-api.md)
- 验证 hub CORS 接受 localhost:3000 dev origin
- 验证 Better Auth 在 cross-origin (localhost:8787 ↔ localhost:3000) 下 cookie 正常

## 风险登记

详见 [ideation §7](2026-05-18-firefly-mesh-web-migration-a-ideation.md#7-风险) + [plan §4](2026-05-18-firefly-mesh-web-migration-a-plan.md#4-风险)。
