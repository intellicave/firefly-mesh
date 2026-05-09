# firefly-mesh edge — 实施计划（plan）

## plan_review_history

| 轮次 | 日期 | 需求覆盖 | 技术合理 | 可执行性 | 风险识别 | VERDICT | 主要修改 |
|------|------|---------|---------|---------|---------|---------|---------|
| R1 | 2026-05-09 | 7 | 7 | 7 | 5 | NEEDS_IMPROVEMENT | - |
| R2 | 2026-05-09 | 8 | 8 | 8 | 8 | **PASS** | wrangler→M0; OPK API 对齐; HITL 精简; TTL 澄清; 风险补充 |

---

> **输入**：[meta.md](2026-05-08-firefly-mesh-edge-meta.md) + [ideation.md](2026-05-08-firefly-mesh-edge-ideation.md) + [design.md](2026-05-08-firefly-mesh-edge-design.md) + [rules.md](2026-05-08-firefly-mesh-edge-rules.md)
> **原则**：契约式验收 / 禁占位 / 禁 mock / 禁降阶
> **MVP 目标**：P0 demo（5 分钟内端到端）+ free tier 撑 ~2000 用户
> **时间窗**：4-6 周 wall time（小团队 2-3 人）

---

## 1. milestone 总览

```
M0 工程初始化 ─▶ M1 身份层 ─▶ M2 投递层 ─▶ M3 加密层 ─▶ M4 协议层 ─▶ M5 体验层 ─▶ M6 P0 demo
                                                                                            │
                                                                                            ▼
                                                                                    M7 hardening
                                                                                            │
                                                                                            ▼
                                                                                    M8 V1.0 GA
```

---

## 2. milestone 详情

### M0 — 工程初始化（0.5-1 周）

**目标**：仓库结构确立、CI 跑通、最小 hello world 部署到 Cloudflare。

**Acceptance criteria**：

- [ ] `wrangler` 安装配置：`services/hub/package.json` devDeps 加 wrangler，`pnpm exec wrangler --version` 输出版本号
- [ ] `services/hub/` 用 Hono + Cloudflare Workers，部署到 `hub-dev.firefly-mesh.io` 返回 `{status:"ok"}`
- [ ] `services/pwa/` 用 Astro 部署到 `firefly-mesh.io` 显示 placeholder 首页
- [ ] D1 数据库创建（`firefly-mesh-edge-dev` + `firefly-mesh-edge-prod`），跑了一次 hello migration
- [ ] `packages/proto/`、`packages/crypto/`、`packages/shared/` 创建，最小 export
- [ ] `packages/client/` 创建骨架:
  - [ ] `SKILL.md`（agentskills.io v1 格式，复制 classic 骨架）
  - [ ] `src/adapters/openclaw.ts`（HTTP 主路径 + WebSocket 可选，OpenClaw/Claude Code 用）
  - [ ] `src/adapters/mcp.ts`（HTTP only，Cursor/Claude Desktop 用）
  - [ ] `src/http-client.ts`（底层 HTTP transport 封装，两个 adapter 共用）
  - [ ] 还未接 hub，只有接口定义
- [ ] CI（GitHub Actions）：每 PR 跑 typecheck + biome lint + 部署到 preview 环境
- [ ] `legacy/v0/` 把 classic 代码归档进去
- [ ] 主分支重命名（main → edge），classic 保留 branch `legacy-v0`
- [ ] [`rules.md`](2026-05-08-firefly-mesh-edge-rules.md) 里所有 [CI] 标记的检查在 GitHub Actions 配好

**风险**：Cloudflare Workers + D1 + DO 联调路径（dev / prod 环境配置可能要几次试错）。

**人力**：1 人 / 4 天。

---

### M1 — 身份层（1 周）

**目标**：用户能注册、登录、创建团队、邀请成员。

**Acceptance criteria**：

- [ ] Better Auth + D1 adapter 跑通,`/api/auth/sign-up` `/api/auth/sign-in` 工作
- [ ] OAuth provider:Google + GitHub 至少跑通(Apple P1)
- [ ] D1 schema:`users` `oauth_accounts` `sessions` 表
- [ ] D1 schema:`tenants` `memberships` `invitations` 表
- [ ] API endpoints:
  - [ ] POST /api/tenants(创建团队)
  - [ ] GET /api/tenants/me(我的团队列表)
  - [ ] POST /api/tenants/:id/invite(发邀请,Resend 发邮件)
  - [ ] POST /api/invitations/:token/accept(接受邀请)
  - [ ] GET /api/tenants/:id/members(成员列表)
- [ ] PWA 页面:
  - [ ] /signup /login(Better Auth UI)
  - [ ] /onboarding(创建/加入团队)
  - [ ] /app/:tenant/members(成员管理)
- [ ] Resend 集成,真实邀请邮件发送(用 cyberautonomy.io 做发件域名)
- [ ] E2E:Carol 注册 → 创建 Acme → 邀请 alice@example.com → Alice 收到邮件 → 点击 → 注册 → 进入 Acme dashboard

**人力**:1-2 人 / 5 天.

---

### M2 — 投递层(1 周)

**目标**:Durable Object hub 能 accept WebSocket、转发消息、持久化离线。

**Acceptance criteria**:

- [ ] `services/hub/src/durable-objects/TenantHub.ts` 实现:
  - [ ] WebSocket Hibernation API(`webSocketServer` mode)—— PWA 实时 inbox 使用
  - [ ] WebSocket connection 时验 JWT,绑定 agentId + tenantId
  - [ ] 收到 `{op:"send"}` 帧（WebSocket）→ 验签 → 写 messages_meta → 路由到接收方 / pending
  - [ ] receiver 在线（WebSocket）→ 直接 forward
  - [ ] receiver 离线 → INSERT pending_messages + 触发 web-push
- [ ] HTTP 消息 endpoints（skill 主路径）:
  - [ ] POST /api/messages（发送，等同 WebSocket send）
  - [ ] GET /api/messages/inbox?after=:lastSeq（拉取，支持 MCP 无状态调用）
  - [ ] POST /api/messages/:id/ack（确认已读）
- [ ] D1 schema:`agents` `messages_meta` `pending_messages` 表
- [ ] HTTP endpoints:
  - [ ] POST /api/agents/pair-init
  - [ ] GET /api/agents/pair-status
  - [ ] POST /api/agents/pair-confirm
  - [ ] POST /api/agents/register
- [ ] Cron Worker:
  - [ ] 每小时清理 pending_messages.expires_at < now
  - [ ] 每日清理 audit_log > 90 天(Free) / > 365 天(Team)
- [ ] Web Push:VAPID keys 生成,push subscription 注册,真实推送送达
- [ ] E2E:用 curl 模拟 skill HTTP 调用,完成 pair → register → 发消息 → GET inbox 收到消息（暂用明文,加密在 M3）；同时用 wscat 验证 PWA WebSocket 路径

**人力**:1-2 人 / 5 天.

---

### M3 — 加密层(1 周)

**目标**:消息真正端到端加密,hub 看不到 body。

**Acceptance criteria**:

- [ ] `packages/crypto/` 实现（使用 `@noble/curves` + `@noble/ciphers`，不自研密码学）:
  - [ ] X25519 keypair 生成（`@noble/curves/x25519`）
  - [ ] X3DH（简化版，无 Double Ratchet）派生 shared key
  - [ ] AES-256-GCM encrypt / decrypt（`@noble/ciphers/aes`）
  - [ ] HKDF-SHA256（Web Crypto API 或 `@noble/hashes`）
- [ ] `packages/proto/` 扩展 wire format:`content.encrypted = { ciphertext, nonce, ephemeral_pk }`
- [ ] D1 schema 扩展:`agents.identity_key_x` `agents.signed_prekey` `agents.signed_prekey_sig` `one_time_prekeys` 表
- [ ] HTTP endpoints:
  - [ ] GET /api/agents/:agentId/prekey-bundle（返回 SPK + 1 个 OPK，标 OPK used；响应含 `lowPrekeys: true` 当余量 < 10）
  - [ ] PUT /api/agents/:agentId/prekeys（skill 批量上传补充 OPK；触发条件：prekey-bundle 响应 lowPrekeys=true）
- [ ] skill 端:消息发送前自动加密,接收后自动解密
- [ ] hub 端:**永远不**调 `decrypt`,只 forward / 持久化加密 blob
- [ ] CI 加 grep:`services/hub/` 不允许 import `packages/crypto/encrypt|decrypt`
- [ ] E2E:在 D1 后台直接 SELECT messages_meta,确认 encrypted_payload 是密文,无法肉眼读出

**风险**:加密库选型 + 浏览器/Node 环境兼容(浏览器用 Web Crypto API 还是 noble?统一用 noble)。

**人力**:1 人 / 5 天(密码学,需要专注).

---

### M4 — 协议层(0.5 周)

**目标**:A2A v1.0 wire format 完整,签名验证 + canonical JSON 工作。

**Acceptance criteria**:

- [ ] `packages/proto/src/a2a-wire.ts` zod schema 完整（从 classic 搬来 + 加 encrypted 字段）
- [ ] `packages/proto/src/signing.ts` canonicalize + sign + verify:
  - 签名用 `@noble/curves/ed25519`（不用 Node.js `crypto.sign`，保证 browser/Worker 兼容）
  - canonical JSON 用 `canonicalize` npm 包（RFC 8785，deterministic key order）
  - 从 classic `packages/core/src/a2a/signing.ts` 搬来逻辑，替换底层库
- [ ] hub 拒绝任何签名无效的消息
- [ ] hub 拒绝 protocolVersion 不是 "1.2" 的消息
- [ ] 标准 HTTP A2A endpoint:
  - [ ] GET /api/a2a/agent-card/:agentId（公开 agent 信息）
  - [ ] POST /api/a2a/message（接收外部 A2A wire format 消息，ed25519 验签）
- [ ] 用 Google ADK 调试器(或同等工具)能向 edge 发标准 A2A 消息并收到响应
- [ ] HITL 状态机（简化版，落到 D1）:
  - [ ] `computeHitlFlags(messageType) → { requireApproval: boolean, autoAccept: boolean }` 函数
  - [ ] POST /api/messages/:id/accept（接收方确认，删除 pending_message，保留 messages_meta）
  - [ ] POST /api/messages/:id/reject（接收方拒绝，删除 pending_message）
  - [ ] 接受后可通过 messages_meta 查询历史（不再有明文内容，只有 metadata）

**人力**:1 人 / 3 天.

---

### M5 — 体验层(1 周)

**目标**:PWA inbox 可用,Web Push 联调通,Email digest 工作。

**Acceptance criteria**:

- [ ] PWA 页面:
  - [ ] /connect?code=X(device pairing 确认页)
  - [ ] /app/:tenant/inbox(收件箱列表 + 新消息红点)
  - [ ] /app/:tenant/threads/:id(单 thread 视图,显示明文 summary,加密 body 用客户端密钥解)
  - [ ] /app/:tenant/devices(我的设备列表 + 撤销)
  - [ ] /app/me(推送订阅 + 通知偏好)
- [ ] Service Worker 注册 + Web Push 订阅
- [ ] PWA 通过 WebSocket 直连 DO,实时刷新 inbox
- [ ] PWA 离线模式:Service Worker 缓存最近 100 条消息
- [ ] Email digest Cron:每小时扫不在线 24h+ 的用户,有未读 → 发摘要邮件
- [ ] iOS 16.4+ Safari 测试 PWA 安装 + Web Push 触达

**人力**:1-2 人 / 5 天.

---

### M6 — P0 demo(0.5 周)

**目标**:端到端用户旅程跑通,可以做投资人 demo + 内测。

**Acceptance criteria**:

- [ ] **关键 demo**(详见 [ideation.md §7.1](2026-05-08-firefly-mesh-edge-ideation.md#71-p0-demo4-5-周内可演示)):
  - [ ] 全新用户注册 → 创建团队 → 邀请第二人 → 双方装 skill → 发收消息 → Web Push → 双方在 PWA 看到消息
  - [ ] 总耗时 ≤ 5 分钟,**两人都从零开始**
  - [ ] 全程 0 命令行参数 0 token 粘贴
  - [ ] D1 后台确认 messages_meta 是 encrypted blob
  - [ ] Alice 关机 → Bob 24 小时内仍能收到消息
- [ ] OpenClaw skill v2 真实可装(`pnpm publish` 到 npm 私有 registry 或 internal feed)
- [ ] 所有 CI 检查全绿
- [ ] 部署到 staging.firefly-mesh.io,5 个内测用户跑通

**风险点**:Web Push 在 iOS / 不同浏览器的兼容性问题,需要预留 buffer。

**人力**:全员 / 3 天.

---

### M7 — Hardening(1-2 周)

**目标**:容量测试、安全审计、文档、bug 收尾。

**Acceptance criteria**:

- [ ] 负载测试:模拟 1000 用户并发 → DO 不崩、D1 不超限
- [ ] 安全审计:第三方(或 internal)review 加密层实现
- [ ] 错误处理:WebSocket 断线 / pairing 超时 / 邮件失败 / push 失败 都有 user-facing 提示
- [ ] i18n 框架(简体中文 + 英文,vibe coder 多语言友好)
- [ ] Docs site:用 Astro Starlight 部署到 docs.firefly-mesh.io
- [ ] Self-host docker compose 跑通(`docker compose up` 起 hub + postgres + caddy + pwa)
- [ ] MCP adapter 跑通（Cursor / Claude Desktop）:skill HTTP 路径直接兼容，`packages/client/src/adapters/mcp.ts` 实现同一 HTTP API 的 MCP transport 包装

**人力**:1-2 人 / 1-2 周.

---

### M8 — V1.0 GA(2-3 周)

**目标**:开放注册,产品上线。

**Acceptance criteria**:

- [ ] 移除 staging,启用生产域名
- [ ] Stripe 集成 Team plan ($8/seat 月 / $6/seat 年)
- [ ] Free tier 上限触发(第 6 人)弹付费墙
- [ ] Status page (status.firefly-mesh.io)
- [ ] Privacy policy / Terms of Service / DPA(企业 GDPR)
- [ ] Sentry 监控 + Cloudflare Analytics
- [ ] HackerNews / Twitter / Reddit 发布
- [ ] 100 个真实团队 onboard

**人力**:全员 / 2-3 周(含运营).

---

## 3. 时间总览

| Milestone | wall time | 关键里程碑 |
|---|---|---|
| M0 工程初始化 | 0.5-1 周 | repo + CI + Cloudflare 部署 |
| M1 身份层 | 1 周 | 注册/登录/团队/邀请 |
| M2 投递层 | 1 周 | DO + WebSocket + pending |
| M3 加密层 | 1 周 | X3DH + AES-GCM + skill 端加密 |
| M4 协议层 | 0.5 周 | A2A wire + 签名 + HITL |
| M5 体验层 | 1 周 | PWA + Web Push + Email |
| M6 P0 demo | 0.5 周 | 端到端跑通 |
| **P0 总计** | **5.5-6 周** | |
| M7 Hardening | 1-2 周 | 负载 / 安全 / docs |
| M8 V1.0 GA | 2-3 周 | Stripe / 上线 / 获客 |
| **V1.0 总计** | **8-11 周** | |

**这是 2-3 人小团队的估算**.如果是 1 人,按 1.5 倍算(8-9 周到 P0).

---

## 4. 并行化机会

M1-M5 中,某些工作可以并行:

| 并行批 | 工作 |
|---|---|
| 批 1(M1+M2) | M1 身份层 + M2 投递层(PWA 还没用上,先各自搭骨架) |
| 批 2(M3+M4) | M3 加密 + M4 协议(都在 packages/,M2 完成后启动) |
| 批 3(M5) | M5 体验层(M3 完成后启动,需要加密层做支撑) |

**关键串行点**:
- M2 → M3(投递层先有,加密层才能往里面填字段)
- M3 → M5(体验层显示消息需要解密)
- 全部 → M6(端到端 demo 需要每一层都可用)

---

## 5. 风险登记

| 风险 | 严重度 | 触发条件 | 缓解 |
|---|---|---|---|
| Cloudflare DO 联调坑 | 中 | M0/M2 阶段 | 提前 1-2 天 spike,熟悉 wrangler dev / DO Hibernation |
| 加密库浏览器/Node 不一致 | 高 | M3 | 用 @noble/* 全统一,不混 Web Crypto |
| iOS Web Push 不工作 | 中 | M5/M6 | 预留 1 天 buffer,Email digest 兜底 |
| Self-host 版工作量被低估 | 中 | M7 | 单独立 milestone,不阻挡 P0 |
| 找不到内测用户 | 中 | M6 | Cyberautonomy 自己人先试用 |
| Stripe / 合规手续慢 | 低 | M8 | 提前 4 周开启业务流程 |
| 网络层换 hub 模式后,SaaS 全栈断链(Cloudflare Mesh / Tailscale 不再相关) | 低 | 已经决策 | 设计 D1 / D7 已固化 |
| Resend DNS 验证（DKIM/SPF/DMARC on cyberautonomy.io）耗时 | 低 | M1 邮件功能上线前 | 提前 3 天申请 Resend 域名验证；M1 email E2E 排在 DNS 通过后 |
| M2-M3 出问题需回滚 | 低 | 任何 milestone | legacy-v0 分支保留 classic 可运行版本；M6 前 staging 可随时切回 legacy 域名指向 |

---

## 6. 免费档容量计算

依据 [meta.md §2.3](2026-05-08-firefly-mesh-edge-meta.md#23-部署模型重了) + [design.md §2.3](2026-05-08-firefly-mesh-edge-design.md#23-do-hibernation--成本关键):

| Cloudflare 资源 | 免费档 | 每用户每天消耗(估算) | 上限 |
|---|---|---|---|
| Workers requests | 100k/day | ~30(注册/dashboard/HTTP API) | ~3,300 用户 |
| D1 reads | 5M/day | ~100(消息列表 / inbox) | ~50,000 用户 |
| D1 writes | 100k/day | ~30(消息持久化) | ~3,300 用户 |
| D1 storage | 5GB | ~0.5MB/用户（pending_messages 72h 自动清理 + messages_meta 14d 保留） | ~10,000 用户 |
| DO requests | 100k/day | ~50(WebSocket 唤醒/消息) | **~2,000 用户** |
| DO duration | 13k GB-s/day | hibernation 大幅降低 | 不是瓶颈 |
| R2 storage | 10GB | 0(MVP 无附件) | 不是瓶颈 |
| Resend emails | 3000/月 | ~0.1(邀请/digest) | ~30,000 用户/月 |

**真正瓶颈:DO requests = ~2,000 用户**.

升档到 Workers Paid($5/月起,DO $0.30/M req):
- 每 100 团队约 $0.10/月增量成本
- Team plan $48/月(5 seats) 反哺,毛利 99%

---

## 7. 不在 P0/V1.0 范围

明确**不在本计划**的事(防止 scope creep):

- KB(三层知识库)— V0.2
- Skill registry(三层 skill)— V0.2
- 多设备 CRDT 同步 — P2
- Forward secrecy(Double Ratchet)— P1
- 中国市场(微信 / 百度 / 阿里)— V1.5+
- Vector search(Cloudflare Vectorize 集成)— V0.2
- 大文件传输 — V1.5+
- Audit metadata 同步到 GitHub repo — Team plan 可选
- Telegram bot 桥接 — Team plan 增值
- iOS / Android native app — 不做(PWA 足够)

---

## 8. 完成定义(DoD)

**P0 完成 = 满足全部以下**:

1. M0-M6 所有 acceptance criteria 全部 `[x]`
2. CI 全绿(rules.md 全部 [CI] 检查通过)
3. Cyberautonomy 内部 5 名同事跑通端到端
4. 产品 5 分钟流程视频录好
5. docs site 有最小可读文档(README + Quickstart + Architecture)

**V1.0 完成 = P0 + M7 + M8 全部完成**.
