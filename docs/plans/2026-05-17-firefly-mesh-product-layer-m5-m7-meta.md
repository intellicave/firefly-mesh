# product-layer M5-M7 — Meta

> 增量 sprint，沿用 [2026-05-16 meta.md](2026-05-16-firefly-mesh-product-layer-meta.md) 全部决策。本文档只记录本 sprint delta。

---

## 1. 项目代号

继承 `firefly-mesh-product-layer` 主线。本 sprint 子代号 `m5-m7`。

文档系列前缀：`2026-05-17-firefly-mesh-product-layer-m5-m7-*`

---

## 2. 本 sprint 范围

实现 M5 + M6 + M7（半成品）三个模块，详见 [ideation.md](2026-05-17-firefly-mesh-product-layer-m5-m7-ideation.md) §3。

---

## 3. 关系链

| sprint | 关系 |
|---|---|
| `2026-04-28-firefly-mesh-*`（classic） | 历史归档，不引用 |
| `2026-05-07-firefly-mesh-scene-*`（scene） | 独立支线，不动 |
| `2026-05-08-firefly-mesh-edge-*`（edge） | 技术底座，部分决策保留（见 16/meta §3）|
| `2026-05-16-firefly-mesh-product-layer-*`（上 sprint M1-M4） | 直接前置，全部产出沿用 |
| **`2026-05-17-firefly-mesh-product-layer-m5-m7-*`**（本 sprint） | 当前 |

---

## 4. 决策记录

**继承全部上 sprint 决策（P1-P8）+ edge D1-D8 决策**。

本 sprint 新增 P9-P12：

| ID | 决策 | 理由 |
|---|---|---|
| **P9** | agents.owner_user_id 保留，不 DROP | 向后兼容 + hub 现有代码不需要立即改 |
| **P10** | JWT scope claim 旧 JWT 不失效，verifyAgentJwt 降级 defaultScopes | 升级不中断现有 agent |
| **P11** | agent_tokens client-side activate-by-token 推迟到 V1.1 | 本 sprint 只做 admin 签发管理面；device pairing 已够用 |
| **P12** | boundary 改动不主动失效现有 JWT（90 天后才完全生效）| 已知 tradeoff，与 v0 一致；V1.1 加 force-refresh |

---

## 5. 不可破坏

- ✅ 全部继承上 sprint §8 边界
- ✅ 新增红线：boundary 改动不应导致 agent 立即被踢下线（已签 JWT 仍有效到过期）

---
