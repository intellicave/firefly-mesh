# Web Migration A — UI

> 本 sprint **不重新设计 UI**。继承 legacy v0 dashboard 的全部页面 + shadcn/ui 设计语言。仅做 fetch 重定向 + app/page.tsx 替换 + 缺失端点的禁用 banner。

## 1. v0 dashboard 现有页面

| 路径 | 文件 | 用途 | sprint A 状态 |
|---|---|---|---|
| `/` | app/page.tsx | landing | **重写**（W7 fix：客户端 auth gate；v0 原文件是 RSC 调 db）|
| `/login` | app/login/page.tsx | Better Auth signin form | 不动 |
| `/signup` | app/signup/page.tsx | Better Auth signup form | 不动 |
| `/onboarding` | app/onboarding/page.tsx | 引导首页 | 路径 rename + onboarding/state 改用客户端聚合 |
| `/onboarding/create-org` | app/onboarding/create-org/page.tsx | 创建公司 | 路径 rename `/api/org` → `/api/organizations/me` |
| `/onboarding/import` | app/onboarding/import/page.tsx | 导入员工 CSV | **禁用 banner**（hub 无 bulk import endpoint，AE1）|
| `/onboarding/tokens` | app/onboarding/tokens/page.tsx | 签发 agent token | 路径 rename + 改用 N 次 POST 替代 batch |
| `/onboarding/done` | app/onboarding/done/page.tsx | 完成 | 不动 |
| `/(dashboard)/inbox` | inbox/page.tsx | A2A 收件箱 | 路径 rename `/api/a2a/*` → `/api/a2a-messages/*` |
| `/(dashboard)/organization` | organization/page.tsx | 员工/部门/项目管理 | 路径 rename 单数→复数 + 客户端聚合替代 /api/org/graph |
| `/(dashboard)/knowledge` | knowledge/page.tsx | 知识库 | 路径 rename + multipart upload 禁用 + SSE live 失效 banner |
| `/(dashboard)/skills` | skills/page.tsx | 技能 | 路径 rename + 隐藏 dry-run + loaded tab 禁用 |
| `/(dashboard)/audit` | audit/page.tsx | 审计日志 | **空状态 + "Coming soon" banner**（hub M12 只做写入）|
| `/(dashboard)/settings` | settings/page.tsx | 设置 + agent 管理 | 路径 rename `/api/token` → `/api/agent-tokens` |

## 2. 新增 UI 元素

### 2.1 LanguageSwitcher（W5' 修订）

**不**从 services/pwa 抢救（pwa 用 Astro 多 island Zustand store，搬过来会引 SSR hydration mismatch）。

改为：
- 用 v0 已有的 next-intl（package.json 已含 `next-intl@4.11.0`）
- v0 已有 `lib/messages/en.ts`，sprint A 加 `lib/messages/zh.ts`（中文翻译内容**从 services/pwa/src/i18n/zh.ts 抢救**，仅复制 key-value，不复制实现）
- 写一个简单的 LanguageSwitcher client component（不超过 50 行），调 next-intl 的 `useLocale` + `setLocale`
- 集成进 dashboard 顶部 nav（推荐放 settings menu 旁）

### 2.2 禁用 banner / 空状态组件

| 页面 | UI 元素 | 文案 |
|---|---|---|
| /onboarding/import | `<Alert variant="warning">` 顶部 | "员工批量导入功能将在 sprint B 上线，请暂时使用 API 单条添加" |
| /(dashboard)/knowledge | multipart upload-dialog | "文件上传待 V1.1，目前请使用 inline 文本输入" |
| /(dashboard)/skills | dry-run 按钮 | `disabled={true}` + tooltip "Skill 执行引擎在 V2 sprint" |
| /(dashboard)/skills | loaded tab | 隐藏（V0 v1 用不到，sprint B 视需补）|
| /(dashboard)/audit | 主面板 | `<EmptyState>` "审计读取端 endpoint 待 audit-read sprint" |
| /(dashboard)/knowledge | SSE Live 指示器 | console.warn + 显示静态 "Indexing..."（SSE 连失败 silent fail）|
| /(dashboard)/audit | SSE Live 指示器 | 同上 |

### 2.3 其余无新增

shadcn/ui 组件、theme、color tokens、动效、所有现有 UI 元素零改动。

## 3. 已知 UI gap（推到 sprint B / 后续）

| Gap | 原因 | 修复时机 |
|---|---|---|
| /(dashboard)/audit 显示空状态 | hub GET /api/audit 未实现（M12 只做写入面） | audit-read sprint |
| /(dashboard)/skills 没有 "assign to agent" 入口 | UI 没有按钮，但 hub /api/skills/:id/assign 已 ready | sprint B 或 skills UI sprint |
| 部分 v0 onboarding 流程跟 hub 新流程不一致 | v0 onboarding wizard 多步导入员工 CSV；hub 没接 CSV import endpoint | 推 V1.1 |
| Web Push subscription UI | hub 已有，但 UI 没接 | 独立 push UI sprint |
| Live 实时更新（audit / knowledge indexing） | hub 不实现 SSE，sprint A 也不接 WS | sprint B 用 WS 客户端替代 |
| 文件上传（knowledge / employee CSV） | hub multipart 端点未实现 | sprint B / V1.1 加 multipart route |

## 4. 视觉验证

sprint A 不做截图比对 / Storybook。dev 跑起来后人工肉眼验证：
- Login 页面渲染 OK
- 注册成功后 root `/` 重定向到 /onboarding 或 /inbox（W7 客户端 gate 工作）
- Dashboard 主页有 sidebar
- 中英切换按钮工作（next-intl）
- 4-5 个核心页面 (organization, inbox, knowledge, skills, settings) 至少能加载（数据为空也算 OK）
- 禁用 banner 在对应页面正确显示

sprint B 起加 Playwright E2E + Lighthouse 评分。
