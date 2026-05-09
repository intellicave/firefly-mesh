# firefly-mesh edge — 产品创意（ideation）

> **输入**：2026-05-08 专家团队会议（产品 / 网络 / 分布式 / 安全 / DevOps / 前端 / 商业 / 协议 8 角度）
> **输出**：用户画像、价值主张、成功标准、不做的事
> **下游**：[design.md](2026-05-08-firefly-mesh-edge-design.md) / [plan.md](2026-05-08-firefly-mesh-edge-plan.md)

---

## 1. 一句话定位

**firefly-mesh edge 是一个 SaaS。让 vibe coder 在 OpenClaw / Claude Code / Cursor 里装一个 skill，他的 AI agent 就能找到队友的 agent 一起干活。**

零网络配置、零命令行参数、端到端加密、锁屏推送、Free tier 永久 5 人。

---

## 2. 用户画像

### 2.1 主用户：vibe coder

| 维度 | 描述 |
|---|---|
| 角色 | 独立开发者 / freelance / 在校生 / 创业早期成员 |
| 技术栈 | TypeScript / Python / 各种前端框架 |
| 工作场所 | 家、咖啡馆、共享办公（**全部在 NAT 后**） |
| 已用工具 | OpenClaw / Claude Code / Cursor / GitHub / Vercel |
| AI 心智 | 把 LLM 当协作者而不是工具 |
| 网络知识 | 不知道什么是 NAT、port forwarding、VPN |
| 付费意愿 | 月费 $10 以下 OK，年付 $50-100 OK，企业级月费 $50+ 拒 |
| 团队规模 | 2-10 人居多 |
| 触达渠道 | Twitter/X、HackerNews、Reddit、Discord |

### 2.2 次用户：admin（其实就是 vibe coder 自己）

vibe coder 团队没有专职 admin。"创建团队"这件事就是发起人自己做，所以 admin 不是独立角色。这跟 classic 假设的"企业 IT ops"完全不同。

### 2.3 不是用户

- **企业用户**：他们走 firefly（SaaS 上级项目），不走 edge。但 edge 的 self-host docker compose 兜底——如果有企业要"自己部署"也能用
- **完全不写代码的人**：edge 的入口是 OpenClaw skill，必须装 skill 才能用
- **超大规模团队（>50 人）**：edge 的免费/Team 档不为这个规模设计

---

## 3. 用户旅程（首次成功路径）

### 3.1 Carol 创建团队（管理员视角，5 分钟）

```
1. 访问 firefly-mesh.io → 点 "Get Started"
2. 用邮箱+密码 / Google / GitHub 注册（Better Auth）
3. 创建团队 "Acme"
4. 拿到 invite link: firefly-mesh.io/join/acme-x9k2j
5. 复制，丢到群里
```

### 3.2 Alice 加入团队 + 装 skill（90 秒）

```
1. 在群里点 invite link
2. 浏览器登录（Google）→ 接受邀请
3. Dashboard 显示："Connect your OpenClaw"
   $ openclaw skill install firefly-mesh
4. Alice 终端跑命令
   skill 弹浏览器到 firefly-mesh.io/connect?code=AB-9X42-K7
5. 浏览器（已登录）确认绑定 → 点 [Bind]
6. skill 自动:
   - WebSocket 连 hub
   - 派生 X25519 keypair（端到端加密用）
   - 注册 Web Push 订阅
   - 拿到长期 JWT，存 OS keychain
7. 浏览器锁屏弹通知:"Welcome to Acme"
```

### 3.3 Alice 让她的 Agent 联系 Bob（首次消息）

```
[OpenClaw 对话框]
Alice: "请 Bob 帮我加个 webhook 通知功能"

[OpenClaw LLM]
  → 调 firefly.a2a.send tool

[skill 本地]
  1. 用 Bob 的 X25519 公钥派生会话密钥
  2. AES-256-GCM 加密 content
  3. ed25519 签整个信封
  4. 通过 WebSocket 发给 hub

[hub: Durable Object]
  - 验签
  - 持久化加密 blob
  - 触发 Web Push → "Alice asked you something"

[Bob 的 OpenClaw（在线）]
  - WebSocket 收到加密 blob
  - 本地解密
  - 推到 LLM 处理或人工 inbox

[Bob 的浏览器（离线时）]
  - 推送到达，点击
  - PWA 拉加密消息
  - 本地解密 → 显示
  - 点 [Accept] → ed25519 签 commit 消息回去
```

**全程**：消息内容**永远不在 hub 明文存在**。hub 只看到 metadata。

---

## 4. 价值主张（为什么值得装）

### 4.1 vs 直接用 IM（Slack/Discord）传消息

- IM 是给人看的；agent 之间发结构化消息要靠机器人或自定义 webhook
- IM 没有 A2A 标准（消息类型、签名、HITL）
- IM 不会触发对方 agent 自动处理 —— 还得人转给 agent

### 4.2 vs Cursor/Claude Code 自带 multi-agent

- 那是**单租户内部** N 个 agent（同一个用户的多 LLM 实例）
- 跨用户、跨设备、跨 runtime 的协作 = 还是空白市场
- edge 填这个空

### 4.3 vs 自己拼 Tailscale + 自写 server

- vibe coder 不会装 Tailscale + 配 ACL
- 自写 server = 不会做端到端加密
- edge = 装一个 skill，全部解决

---

## 5. 核心问题清单（必须解决）

按 vibe coder 痛感排序：

| # | 问题 | edge 怎么解 |
|---|---|---|
| 1 | NAT 后两个用户怎么互通 | WebSocket 反向连接 hub，根本不解决 NAT |
| 2 | 离线时消息会丢吗 | hub 持久化加密 blob，14 天 TTL |
| 3 | 我能信任你们看不到我消息吗 | 端到端加密，hub 看不到内容 |
| 4 | 装这个东西要多久 | ≤ 3 分钟（注册 → 第一条消息送达） |
| 5 | 离开桌面会错过通知吗 | Web Push + 邮件兜底 |
| 6 | 我的 OpenClaw 关了再开还能用吗 | 是。重连 + replay last seq |
| 7 | 跨 OpenClaw / Cursor / Claude Code 都行吗 | skill 兼容 agentskills.io v1；MCP 包给不读 SKILL.md 的 runtime |
| 8 | 团队成员离开怎么办 | 在 dashboard 移除 → 撤销其 agent JWT；离线消息删除 |

---

## 6. 不解决的问题

明确**不在 edge 范围内**的事，写下来防止 scope creep：

| 问题 | 为什么不做 |
|---|---|
| 实时音视频通话 | edge 是异步消息系统，不是 IM |
| 大文件传输（>10MB） | hub R2 免费档撑不住；用 Cloudflare R2 paid 或外部链接 |
| LLM 推理 / generation API | 不抢 OpenAI/Anthropic 市场 |
| Agent runtime（ToolLoop） | server 永远不跑 agent loop（继承 classic R7） |
| 多设备同步 同一 employee 多端 | MVP 单设备 active；P2 用 CRDT |
| 跨平台 SSO（SAML/OIDC） | Team plan 才需要；P2 |
| 中国市场（微信登录、ICP 备案） | P2，需要单独 region 部署 |
| 任意 webhook bot 桥接 | 用户可以自己用 firefly.a2a.send 自由桥接 |

---

## 7. 成功标准（acceptance criteria 级）

### 7.1 P0 demo（4-5 周内可演示）

- [ ] 全新用户访问网页 → 注册账号 → 创建团队 → 邀请第二人 → 第二人收到邮件 → 双方各自装 skill 完成 device pairing → Alice 给 Bob 发消息 → Bob 锁屏弹通知 → Bob 在 PWA inbox 看到消息并 accept
- [ ] **总耗时 ≤ 5 分钟**（包括两人都从零开始）
- [ ] 全程**0 命令行参数粘贴、0 token 复制粘贴**
- [ ] 消息内容**端到端加密**（在 D1 里看到 encrypted blob 而非明文）
- [ ] Alice 关机后 Bob 仍能在 24 小时内收到消息（store-and-forward 工作）

### 7.2 V1.0 GA（3 个月）

- [ ] 100 个真实团队 onboard
- [ ] free tier 在 Cloudflare 免费档内（worker req < 80k/day, D1 < 50GB）
- [ ] WebSocket 重连成功率 > 99%
- [ ] Web Push 送达率 > 95%（按浏览器统计）
- [ ] 5 名以上付费 Team plan 客户

### 7.3 长期（12 个月）

- [ ] $10k/月 ARR（Team plan ≈ 100 付费 seat）
- [ ] 1000 GitHub stars
- [ ] 至少 3 个非 Cyberautonomy 的核心 contributor
- [ ] 自部署 docker compose 被至少 5 家 enterprise 试用

---

## 8. 商业模式

| Tier | 月费 | 包含 |
|---|---|---|
| **Free** | $0 | 1 团队、5 成员、E2E 加密、Web Push、30 天 audit metadata |
| **Team** | $8/seat（年付 $6） | 不限成员、Email digest、1 年 audit、Apple Sign-In、SSO（OIDC）|
| **Enterprise** | 联系销售 | docker compose self-host license、SLA、合规导出、定制集成 |

### 病毒回路

Free tier 卡 5 人。第 6 人加入时弹："Acme 已达 Free tier 上限。升级 Team plan ($48/月) 解锁。"——5 → 6 是天然付费扳机。

### Unit economics（基于 [meta.md](2026-05-08-firefly-mesh-edge-meta.md) §3 决策）

- 每用户云成本 $0.05-$0.15（Cloudflare paid 档时）
- 毛利 ~95-98%
- LTV: assume 12 个月 = $96/seat
- CAC 目标: ≤ $30/seat（Twitter / HN / 内容获客）

---

## 9. 风险与缓解

| 风险 | 严重度 | 缓解 |
|---|---|---|
| Cloudflare DO 免费档撑不住增长 | 中 | 平滑升 Workers Paid（$5/月起，配置切换 0 代码） |
| Cloudflare 政策变动（vendor lock-in） | 中 | 自部署 docker compose 路径（Hono + ws + Postgres） |
| 端到端加密导致 search/audit 限制 | 低 | hub 看 metadata 已经够 audit；search 在客户端做 |
| OpenClaw / Cursor 自己做 multi-agent 把市场吃掉 | 高 | 跨 runtime + 跨用户的协作是它们做不了的（生态护城河） |
| 公司被收购导致服务关停 | 高 | Apache 2.0 license + 自部署版兜底（用户随时可走） |
| Web Push 在 iOS 体验不一致 | 中 | iOS 16.4+ 已支持 PWA Push；Email digest 兜底 |
| device pairing 流程在某 platform 跑不了 | 中 | fallback 到"复制 token 粘贴"路径（不推荐但兜底） |

---

## 10. 跟 classic 的差异总结

| 维度 | classic | edge |
|---|---|---|
| 用户 | 企业 admin + 员工 | vibe coder + 小团队 |
| 部署 | Docker Compose 自部署 | SaaS-first，self-host 是 enterprise 选项 |
| 网络 | hub 全量代理明文 | WebSocket + E2E 加密 |
| 消息存储 | Postgres 明文 | hub 加密 blob，端解密 |
| 推送 | 无 | Web Push + Email |
| onboarding | wizard + CSV | OAuth + device pairing |
| 商业 | 无明确（开源） | Free / Team / Enterprise tier |
| 工程量 | 9 个月已完成 | 4-6 周到 P0 |

**两者不会共存**。edge 上线后 classic 归档。M0-M9 已完成的代码作为思想参考保留，**但不再迭代**。
