# product-layer M5-M7 — Rules（delta）

> 继承上 sprint 全部 A-J 红线 + edge rules。本文档只追加本 sprint 新增项。

## K. Scope claim 向后兼容

**K1**：`verifyAgentJwt` 必须处理"旧 JWT 无 scope claim"情况，自动降级为 `defaultScopes()`。**禁止**让旧 agent 因升级失效。

**K2**：`signAgentJwt` 调用时 scopes 参数为必填（typed），caller 必须先查 db（或显式传 defaultScopes()）。

## L. Boundary 写入

**L1**：`PUT /api/boundaries/:agentId` 必须校验每个 scope ID 在 `SCOPE_IDS` 里（白名单）。

**L2**：危险 scope（dangerous=true）允许写入但必须明确传入（不会被 default 自动加）。

**L3**：boundary 改动必须写 `audit_log`（action='boundary.updated'）。

## M. Agent Tokens 安全

**M1**：plain token 仅在 POST 和 regenerate 的 response 出现一次；DB 只存 SHA-256 hash。

**M2**：禁止在任何 log / audit_log payload / response（除 issue/regenerate）中包含 plain token。

**M3**：token plain 用 `crypto.getRandomValues(new Uint8Array(32))` + base64url，禁止用 nanoid（熵不够）。

## N. agents 表 ALTER

**N1**：本 sprint 必须用 `ADD COLUMN`，**禁止 DROP** owner_user_id（向后兼容）。

**N2**：新代码访问 owner 时**优先** `owner_employee_id`，回退到 `owner_user_id`。

**N3**：禁止在本 sprint 写"必须有 owner_employee_id"的硬断言（现有 agents 老数据为 null）。
