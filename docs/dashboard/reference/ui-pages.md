# Reference — UI 页面索引

> 这是开发者查表用的"路由 ↔ 文件 ↔ 功能"对照。每个页面属于哪个 feature,看哪份功能文档。

---

## 1. 路由总表

### 公开路由 (不需登录)

| URL | 文件 | 所属 feature |
|---|---|---|
| (营销页) `firefly-mesh.com/` | `services/pwa/src/pages/index.astro` | (营销,不在 dashboard 内) |
| `app.firefly-mesh.com/signup` | `services/dashboard/app/signup/page.tsx` | [07 — 账户与登录](../features/07-account-and-auth.md) |
| `app.firefly-mesh.com/login` | `services/dashboard/app/login/page.tsx` | [07 — 账户与登录](../features/07-account-and-auth.md) |
| `app.firefly-mesh.com/connect` | `services/dashboard/app/connect/page.tsx` | [02 — Agent 接入](../features/02-agent-onboarding.md) |

### Onboarding (登录,无 tenant)

| URL | 文件 | feature |
|---|---|---|
| `/onboarding` | `app/onboarding/page.tsx` | [08 — 快速入门](../features/08-getting-started.md) |
| `/onboarding/create-org` | `app/onboarding/create-org/page.tsx` | 08 |
| `/onboarding/import` | `app/onboarding/import/page.tsx` | 08 |
| `/onboarding/tokens` | `app/onboarding/tokens/page.tsx` | 08 |
| `/onboarding/done` | `app/onboarding/done/page.tsx` | 08 |
| `/onboarding/accept?invite=...` | `app/onboarding/accept/page.tsx` | [03 — 组织管理](../features/03-organization.md) + 08 |

### Dashboard (已登录 + 有 tenant)

| URL | 文件 | feature |
|---|---|---|
| `/inbox` | `app/(dashboard)/inbox/page.tsx` | [01 — 组织内 Agent 消息](../features/01-agent-messaging.md) |
| `/organization` | `app/(dashboard)/organization/page.tsx` | [03 — 组织管理](../features/03-organization.md) |
| `/organization/projects/[id]` | `app/(dashboard)/organization/projects/[id]/page.tsx` | 03 |
| `/knowledge` | `app/(dashboard)/knowledge/page.tsx` | [04 — 知识管理](../features/04-knowledge.md) |
| `/skills` | `app/(dashboard)/skills/page.tsx` | [05 — 技能与工具](../features/05-skills-and-tools.md) |
| `/audit` | `app/(dashboard)/audit/page.tsx` | [06 — 审计日志](../features/06-audit-log.md) |
| `/settings` | `app/(dashboard)/settings/page.tsx` | [07 — 账户与登录](../features/07-account-and-auth.md) |
| `/settings/devices` | `app/(dashboard)/settings/devices/page.tsx` | [02 — Agent 接入](../features/02-agent-onboarding.md) |
| `/settings/members` | `app/(dashboard)/settings/members/page.tsx` | [03 — 组织管理](../features/03-organization.md) |

---

## 2. middleware 跳转规则

`services/dashboard/middleware.ts`:

```
未登录 → 任意 /(dashboard)/*    -- 重定向 → /login?next=<path>
未登录 → /onboarding/*          -- 重定向 → /login?next=<path>  (除 /onboarding/accept)
已登录 → /login, /signup        -- 重定向 → /inbox 或 /onboarding
已登录 + onboarding 未完成 → /(dashboard)/*  -- 重定向 → /onboarding/<未完成 step>
已登录 + onboarding 已完成 → /onboarding/*    -- 重定向 → /inbox  (除 /onboarding/accept)
```

实现:middleware 调 `GET /api/me`(待补端点)拿 `user + tenants + default_tenant_id + onboarding.completed`,决策跳转。

---

## 3. 全局布局组件

### Dashboard layout (`app/(dashboard)/layout.tsx`)

```
┌──────────────────────────────────────────────┐
│  TopBar                                      │
│   • logo (左)                                │
│   • search ⌘K (中,V1 占位)                  │
│   • user menu (右):tenant switcher / 头像 / 中-EN / sign-out │
├──────┬───────────────────────────────────────┤
│      │                                       │
│ Side │           Page content                │
│ bar  │            (max-w-screen-xl mx-auto)  │
│      │                                       │
└──────┴───────────────────────────────────────┘
```

**Sidebar 项** (顺序固定,owner/admin/member 都可见):
1. Inbox (`/inbox`) — feature 01
2. Organization (`/organization`) — feature 03
3. Knowledge (`/knowledge`) — feature 04
4. Skills (`/skills`) — feature 05
5. Audit (`/audit`) — feature 06 (member 角色 V1 也可见但访问时跳转)
6. Settings (`/settings`) — feature 07

**Topbar User menu 下拉项**:
- Account (= `/settings`)
- Devices (= `/settings/devices`)
- Members (= `/settings/members`)
- 中 / EN 切换
- ─────
- Sign out

**响应式**:
- ≥ lg: sidebar 固定 240px
- < lg: sidebar 收为汉堡菜单 (Sheet 弹出)

### Onboarding layout (`app/onboarding/layout.tsx`)

```
┌──────────────────────────────────────────────┐
│  Logo               [● 1 ─ 2 ─ 3 ─ 4]         │
├──────────────────────────────────────────────┤
│                                              │
│         Centered card (max-w-md)             │
│         (step-specific content)              │
│                                              │
│         [Back]              [Continue ▸]     │
└──────────────────────────────────────────────┘
```

无 sidebar。无 user menu (`/signout` 在右上角小链接)。

### Auth layout (`app/(auth)/layout.tsx`)

居中卡片,顶部 logo,无 sidebar 无 user menu。

---

## 4. 共享 UI 组件

来自 `legacy/v0/packages/web/components/ui/` (shadcn-ui),迁移时整体复制到 `services/dashboard/components/ui/`:

- `<Button>` — primary / secondary / ghost / destructive / outline
- `<Input>` / `<Textarea>` / `<Select>` / `<Checkbox>` / `<RadioGroup>` / `<Switch>`
- `<Card>` / `<Dialog>` / `<Sheet>` / `<Popover>` / `<DropdownMenu>` / `<Tabs>` / `<Tooltip>`
- `<Table>` / `<DataTable>` (TanStack Table 封装)
- `<Skeleton>` / `<EmptyState>` / `<ErrorState>`
- `<AlertDialog>` (危险操作)
- `<Toast>` / `<Toaster>`
- `<Avatar>` / `<Badge>` / `<Progress>`

业务组件 (`components/<feature>/...`):每个 feature 自己的 components 目录。

---

## 5. 主题 / 样式

- **Tailwind CSS** — 配置见 `services/dashboard/tailwind.config.ts`(从 v0 复制)
- **暗色模式** — `next-themes`,默认跟随系统;顶部 user menu 加 toggle (V1 可选,V2 加)
- **字体** — Geist (next/font 加载),fallback `system-ui`
- **图标** — `lucide-react`(与 PWA 一致)
- **代码字体** — Geist Mono
- **配色 token**(Tailwind theme):primary / secondary / muted / accent / destructive,皆为 CSS variable

**禁止**:JSX text 节点中出现 emoji unicode 替代图标(违反全局规则,见 CLAUDE.md)。emoji 仅允许在 i18n 文案值、注释、UGC 数据中。

---

## 6. i18n

- 引擎沿用 PWA 现有 `useT()` + `messages.ts` 结构。
- 文件:`services/dashboard/lib/i18n/{messages.ts, en.ts, zh.ts, store.ts, LanguageSwitcher.tsx}`
- key 命名:`dash_<area>_<element>` 前缀,避免和 PWA 的 key 冲突 (e.g. `dash_inbox_loading`)
- 默认语言:`navigator.language` 头匹配 (`zh*` → zh,其他 → en)
- 持久化:`localStorage["firefly-mesh.lang"]`

---

## 7. 路由保护

- 全部 `(dashboard)` route 默认要求登录 + tenant
- `(auth)` route 默认要求 **未登录**(已登录访问会重定向)
- `/onboarding/*` 要求登录但允许 tenant 缺失(创建中)
- `/connect`、`/onboarding/accept` 是特殊"半公开"路由:`/connect` 不强制登录(CLI 触发也能开),`/onboarding/accept` 必须登录才能 POST 接受

---

## 8. 全局错误边界

- `app/error.tsx` — 顶层错误兜底(渲染 ErrorState + Retry)
- 每个 `(dashboard)/<page>/error.tsx` — 局部错误边界,只重置本页
- 401 (cookie 失效) → 全局拦截,自动跳 `/login?next=<当前 path>`

---

## 9. 全局 WS 连接

- 在 `app/(dashboard)/layout.tsx` 中挂载一次 `WSProvider`
- 订阅 `{ topic: 'user', userId }` + 当前 tenant 的 `{ topic: 'tenant', tenantId }`
- 事件分发:
  - `message.new` → feature 01 的 inbox store
  - `message.approved/rejected` → 同上
  - `agent.bound` / `agent.revoked` → feature 02 的 devices store + onboarding step 3
  - `member.invited/joined/left` → feature 03

V1 用 Zustand 或 React Context 做事件总线即可,不需要 Redux。
