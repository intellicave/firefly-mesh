# Web Migration A — UI

> 本 sprint **不重新设计 UI**。继承 legacy v0 dashboard 的全部页面 + shadcn/ui 设计语言。仅做 fetch 重定向，UI 100% 复用。

## 1. v0 dashboard 现有页面（搬过来后保留）

| 路径 | 文件 | 用途 |
|---|---|---|
| `/` | app/page.tsx | landing |
| `/login` | app/login/page.tsx | Better Auth signin form |
| `/signup` | app/signup/page.tsx | Better Auth signup form |
| `/onboarding` | app/onboarding/page.tsx | 引导首页 |
| `/onboarding/create-org` | app/onboarding/create-org/page.tsx | 创建公司 |
| `/onboarding/import` | app/onboarding/import/page.tsx | 导入员工 CSV |
| `/onboarding/tokens` | app/onboarding/tokens/page.tsx | 签发 agent token |
| `/onboarding/done` | app/onboarding/done/page.tsx | 完成 |
| `/(dashboard)/inbox` | inbox/page.tsx | A2A 收件箱 |
| `/(dashboard)/organization` | organization/page.tsx | 员工/部门/项目管理 |
| `/(dashboard)/knowledge` | knowledge/page.tsx | 知识库 |
| `/(dashboard)/skills` | skills/page.tsx | 技能 |
| `/(dashboard)/audit` | audit/page.tsx | 审计日志 |
| `/(dashboard)/settings` | settings/page.tsx | 设置 + agent 管理 |

## 2. 新增 UI 元素（极简）

### 2.1 LanguageSwitcher

从 services/pwa 抢救，集成进 dashboard 的顶部 nav（推荐放 settings menu 旁）。

### 2.2 其余无新增

shadcn/ui 组件、theme、color tokens、动效、所有现有 UI 元素零改动。

## 3. 已知 UI gap（推到 sprint B / 后续）

| Gap | 原因 | 修复时机 |
|---|---|---|
| /(dashboard)/audit 显示空状态 | hub GET /api/audit 未实现（M12 只做写入面） | audit-read sprint |
| /(dashboard)/skills 没有 "assign to agent" 入口 | UI 没有按钮，但 hub /api/skills/:id/assign 已 ready | sprint B 或 skills UI sprint |
| 部分 v0 onboarding 流程跟 hub 新流程不一致 | v0 onboarding wizard 多步导入员工 CSV；hub 没接 CSV import endpoint | 推 V1.1 |
| Web Push subscription UI | hub 已有，但 UI 没接 | 独立 push UI sprint |

## 4. 视觉验证

sprint A 不做截图比对 / Storybook。dev 跑起来后人工肉眼验证：
- Login 页面渲染 OK
- Dashboard 主页有 sidebar
- 中英切换按钮工作
- 4-5 个核心页面 (organization, inbox, knowledge, skills, settings) 至少能加载（数据为空也算 OK）

sprint B 起加 Playwright E2E + Lighthouse 评分。
