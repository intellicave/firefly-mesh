# 全局验收清单

> 整个 dashboard 迁移的完整验收。**每一项都可勾选 + 客观可验证**。每个 feature 的细则在对应 `features/0X-*.md` §8。

---

## 1. 基础设施

- [ ] `services/dashboard/` 在 `app.firefly-mesh.com` 可访问,HTTPS 正常
- [ ] `services/hub/` 在 `hub.firefly-mesh.com` 可访问
- [ ] `services/pwa/` 在 `firefly-mesh.com` 可访问
- [ ] 三个域 SSL 证书均由 Cloudflare 签发(DV)
- [ ] cookie 域 = `.firefly-mesh.com`(DevTools 验证)
- [ ] CORS preflight 通过(`curl -X OPTIONS hub.firefly-mesh.com/api/me -H "Origin: https://app.firefly-mesh.com"` 返回 200 + 正确 ACAO 头)
- [ ] hub `wrangler tail` 无持续报错
- [ ] D1 migrations 0001-0008 全部 apply 完成

---

## 2. Feature 01 — 组织内 Agent 消息

参考 [`features/01-agent-messaging.md`](features/01-agent-messaging.md) §8。关键项:

- [ ] `/inbox` 主流程跑通(列表 / 详情 Sheet / Approve / Reject / Reply)
- [ ] per-owner 隔离:user A 只看到自己 agent 收到的消息
- [ ] WS 实时推送 (Live ●),新消息 1 秒内到达
- [ ] Auto-approve rules:配规则后符合的消息自动批,不进 pending
- [ ] Suggestions:基于历史行为给出至少 1 条规则建议
- [ ] WS 断开自动回退轮询;重连后停止轮询
- [ ] Web Push 通知:点击 deep link 自动打开对应消息
- [ ] Admin view 只读全 tenant 流,不能 Approve/Reject 别人的消息
- [ ] 跨 tenant 攻击 → 403(默认 tenant 隔离,V1 不含跨组织 feature)

## 3. Feature 02 — Agent 接入

参考 [`features/02-agent-onboarding.md`](features/02-agent-onboarding.md) §8。

- [ ] `/settings/devices` 列出 agent
- [ ] Empty state 显示三 runtime 接入卡片
- [ ] `/connect?code=...` 配对页正常,选 tenant + Bind device → 成功
- [ ] WS 推送 `agent.bound`,设备列表实时刷新
- [ ] DELETE agent → revoked,该 agent 后续调用 401
- [ ] Web Push 订阅工作(从另一 tenant 发消息触发通知)

## 4. Feature 03 — 组织管理

参考 [`features/03-organization.md`](features/03-organization.md) §8。

- [ ] Employees / Departments / Projects 三 tab 切换 + CRUD
- [ ] 项目子页 `/organization/projects/:id` 显示任务
- [ ] `/settings/members` 列出活跃成员 + pending 邀请
- [ ] 发邀请 / 撤销邀请 / 改 role / 踢人,全部工作
- [ ] member 角色看不到 admin-only 按钮
- [ ] 跨 tenant 攻击 → 403
- [ ] 邀请邮件链接落在 `app.firefly-mesh.com/onboarding/accept?invite=...`

## 5. Feature 04 — 知识管理

参考 [`features/04-knowledge.md`](features/04-knowledge.md) §8。

- [ ] Documents / Boundaries / Sources 三 tab
- [ ] Folder tree + 文档列表 + 选中渲染 Markdown
- [ ] Upload .md 文档(单文件 ≤256KB)
- [ ] Boundary 编辑器:checkbox 选 folder + 选 group → Save 立即生效
- [ ] member 角色只看到 boundary 允许的文档,看不到 Boundaries tab
- [ ] XSS 防御:含 `<script>` 的 markdown 渲染时被 sanitize

## 6. Feature 05 — 技能与工具

参考 [`features/05-skills-and-tools.md`](features/05-skills-and-tools.md) §8。

- [ ] Skills / Tools / Router 三 tab + CRUD
- [ ] Skill enable/disable toggle
- [ ] Tool「Test connection」:HTTP 类型可测试连通
- [ ] Tool secret 存储:输入 token → 加密存到 tenant_secrets → UI 显示 `••••••`
- [ ] Router 规则拖拽排序
- [ ] Empty state 显示 3 个预设模板
- [ ] **顶部提示「Skill execution coming in V2」** (诚实交付)
- [ ] 跨 tenant 攻击 → 403

## 7. Feature 06 — 审计日志

参考 [`features/06-audit-log.md`](features/06-audit-log.md) §8。

- [ ] `/audit` 列表 + 分页
- [ ] Filter (kind / actor / date range) 全部工作
- [ ] 详情 Sheet 显示 JSON
- [ ] Export CSV 工作(上限 10k 行)
- [ ] member 角色访问 → 重定向或 403
- [ ] 跨 tenant 攻击 → 403
- [ ] cron `audit_log` truncate (90 天) 工作,事件本身也写入 audit_log

## 8. Feature 07 — 账户与登录

参考 [`features/07-account-and-auth.md`](features/07-account-and-auth.md) §8。

- [ ] `/signup` + `/login` 邮箱密码注册/登录
- [ ] Google OAuth → 回到 `app.firefly-mesh.com/onboarding`(不是 hub 域)
- [ ] GitHub OAuth 同上
- [ ] `/settings` Profile / Security / Preferences 三 tab
- [ ] 改密码工作
- [ ] List sessions + revoke
- [ ] 登出 cookie 清空
- [ ] 已登录访问 `/login` → 重定向
- [ ] 中/EN 切换持久化

## 9. Feature 08 — 快速入门

参考 [`features/08-getting-started.md`](features/08-getting-started.md) §8。

- [ ] 新用户首次登录 → 自动跳 `/onboarding/create-org`
- [ ] 4-step wizard 走通,每一步进度条更新
- [ ] Step 3 WS 实时反馈 agent 绑定
- [ ] 完成后 `/inbox`,再访问 `/onboarding` 被重定向
- [ ] 通过邀请进入 → 跳过 4-step
- [ ] 中途关闭浏览器 → 重登恢复到正确 step

---

## 10. 安全验证 (P0)

- [ ] **跨 tenant 攻击**(所有 feature):用 user A 的 cookie 调任意 `/api/tenants/<B 的 tenant id>/*` → 403
- [ ] **WS DO 不崩**(P0-1):发送恶意 binary frame / >64KB payload / 非法 JSON → DO 优雅关闭单 WS,其他 WS 不受影响
- [ ] **Invitation TOCTOU**(P0-2):并发 accept 同一 invitation → 只成功一次,db.batch atomic 保证一致
- [ ] **跨 tenant 默认隔离**(基线):用 user A 的 cookie 调 `/api/tenants/<B>/messages` / `/folders` / `/employees` 等 → 一律 403。V1 不含跨 tenant 通信 feature,这一项验的是默认安全设计。
- [ ] **限流**:`/api/auth/*` 11 req/60s → 第 11 次 429 + Retry-After: 10
- [ ] **audit_log cron**(P0-4):cron 触发 cleanup,lease 工作,批失败时不释放 lease

---

## 11. 性能

- [ ] Lighthouse `firefly-mesh.com/` Performance ≥ 95
- [ ] Lighthouse `app.firefly-mesh.com/login` Performance ≥ 90
- [ ] Dashboard inbox 首屏 FCP < 1.5s (DevTools Performance)
- [ ] WS handshake < 500ms
- [ ] D1 P95 query latency < 100ms (Cloudflare Analytics)

---

## 12. 文档

- [ ] 本文档树 (`docs/dashboard/`) 全部链接可点 (link checker 跑过)
- [ ] README 中所有 feature / reference / migration 文件存在
- [ ] 每个 feature 文档的 §8 验收清单与本文一致
- [ ] `services/hub/wrangler.toml`、`services/dashboard/wrangler.toml`、`services/pwa/astro.config.mjs` 与文档描述一致
- [ ] CLAUDE.md 中的全局规则被全栈遵守(emoji 禁用 / 不静默 fallback / 验证环境断言)

---

## 13. 数据完整性

- [ ] D1 中:每个 tenant 都有自己的 onboarding_state 行
- [ ] D1 中:每条 message 都对应 audit_log 一条
- [ ] D1 中:revoked agent 后,该 agent 的 JWT 写入 revoke list 立即失效
- [ ] D1 中:过期 pair_codes 已被 cron 清理(每小时 1 次)
- [ ] D1 中:90 天前的 audit_log 被 cron 清理

---

## 14. 退化路径

- [ ] Hub 临时不可达:dashboard 显示 ErrorState + Retry,不白屏
- [ ] WS 不可用:fallback 5s 轮询,功能不丢
- [ ] D1 慢(>5s):dashboard 显示 spinner,不锁 UI
- [ ] OAuth provider 拒绝:dashboard 显示错误 banner,可重试

---

## 15. 验收日志

填表(每项一行,谁验,何时,通过/不通过):

```
2026-XX-XX  <reviewer>  Feature 01 §8 全部 ✅
2026-XX-XX  <reviewer>  Feature 02 §8 全部 ✅
...
2026-XX-XX  <reviewer>  Section 10 安全验证 ✅
2026-XX-XX  <reviewer>  Section 11 性能 ✅
```

---

## 16. 完成定义

**Dashboard 迁移视为完成当且仅当**:

1. 上述 §1-14 全部 ✅
2. 至少 3 名 user(测试账号)端到端走通 8 个 feature
3. 24 小时内 hub error rate < 1%
4. 文档树最终 PR 已 merge

完成后:`docs/dashboard/` 的 README §8 中标记 "**v1.0 已完成**",进入 P1/P2 迭代。
