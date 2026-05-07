# UI Fix Backlog — 由 /autodev-review --target ui 产出

**Source**: `.review-evidence/firefly-mesh-ui/01-06-*.png` + `docs/plans/2026-04-28-firefly-mesh-ui.md`
**Reviewer date**: 2026-05-06
**Aggregate verdict**: **FAIL** (/organization + /inbox 拖到 FAIL；其他 4 页 NEEDS_IMPROVEMENT)
**Mode**: ralph-loop + 每轮 /autodev-iterate 单步修复

---

## 修复优先级 + 状态机

每个 task 字段：
- `status`: pending / in_progress / done
- `acceptance_criteria`: 该任务"做完"的客观标准
- `evidence`: 修复后回归证据（截图路径 / 命令输出）

---

## P0 — 严重设计偏离（FAIL 维度，先修）

### P0-A: /organization 接 xyflow + Dagre 真正实现 org graph

- **status**: ✅ done (commit pending)
- **入口文件**: `packages/web/app/(dashboard)/organization/page.tsx` + 新建 `packages/web/components/organization/org-graph.tsx`
- **acceptance_criteria**:
  - [x] 用 `@xyflow/react` + `dagre` 实现 force-directed 节点图
  - [x] 节点显示：avatar + name + title + agent online/offline 圆点 + N agents 计数
  - [x] 边：root (owner / first admin) → department heads → members；unassigned → root
  - [x] 节点 click → 现有 `agent-detail-drawer.tsx` 弹出
  - [x] Toolbar：search input + dept filter dropdown + refresh + Graph/List view toggle
  - [x] xyflow `<Controls />` (zoom/pan/fit)
  - [x] xyflow `<MiniMap />`
  - [x] 节点入场动画 `animate-mesh-in`
  - [x] 4 状态：loading spinner / empty "No employees yet" + admin CTA → /onboarding/import / normal graph / error banner
  - [x] typecheck 5/5 全过
- **evidence**:
  - 截图：`.review-evidence/firefly-mesh-ui/02-organization-after.png`
  - 视觉确认：graph 节点 + dotted background + Controls + MiniMap + toolbar 全部到位

### P0-B: /inbox 加 filter / sort / search 工具条 + Load earlier 分页

- **status**: ✅ done
- **入口文件**: `packages/web/app/(dashboard)/inbox/page.tsx` + `packages/web/app/api/a2a/inbox/route.ts`
- **acceptance_criteria**:
  - [x] 工具条三个 control：type dropdown + counterpart dropdown + sort toggle
  - [x] type 下拉：All types + 7 message types
  - [x] counterpart 下拉：org employees + "Any sender/receiver" (label 跟随 tab)
  - [x] sort: desc / asc 切换 + ArrowUp/ArrowDown 图标
  - [x] "↑ Load earlier" 按钮 — 列表底部，cursor-based pagination
  - [x] API extended: GET /api/a2a/inbox 加 type/counterpart/sort/cursor 参数 + 返回 nextCursor
  - [x] Empty state 区分 filtersActive vs 真空
  - [x] typecheck 5/5 全过
  - [ ] state 同步到 URL search params — 推迟到 P1-B (TopBar cmdk + 全局 state) 时一起做
- **evidence**:
  - 截图 `.review-evidence/firefly-mesh-ui/01-inbox-after.png`
  - 视觉：toolbar 三 control + tabs 英文 ✓

### P0-C: i18n 统一（先全英文，预留 next-intl 接入点）

- **status**: ✅ done (P0-B 顺便完成主目标)
- **入口文件**: `packages/web/app/(dashboard)/inbox/page.tsx`
- **acceptance_criteria**:
  - [x] `grep -rE '[一-鿿]' packages/web/app packages/web/components --include='*.tsx'` 排除注释后 **0 命中**
  - [ ] 抽公共 `messages/en.ts` 文件 — **推迟到 V0.2 接 next-intl 时再做**（当前 0 中文已达"统一"目标，抽离作为 i18n 接入的一部分更经济）
  - [x] typecheck 全过
- **evidence**:
  - grep 0 命中 user-facing 中文
  - inbox 截图 tabs / toolbar / empty state 全英文

---

## P1 — 共性视觉问题

### P1-A: 抽公共 `<EmptyState>` 组件统一所有 5 页空状态

- **status**: ✅ done
- **入口文件**:
  - 新建 `packages/web/components/ui/empty-state.tsx`
  - 替换 `inbox/page.tsx`、`audit/page.tsx`、`organization/page.tsx`、`knowledge/page.tsx`、`skills/page.tsx`
- **acceptance_criteria**:
  - [x] 公共组件 props: `{ Icon, title, description?, cta?, secondary?, className?, children? }`
  - [x] 5 页全部用同一组件
  - [x] knowledge / skills 加 icon + heading + helper + primary CTA
  - [x] organization 0 employees 状态：admin CTA "Import employees" → /onboarding/import
  - [x] knowledge 0 docs 状态：CTA "Upload first document" → 触发 upload dialog
  - [x] skills 0 skills 状态：CTA "Create your first skill" → 触发 create dialog
  - [x] inbox empty: filtersActive 时多 "Clear filters" secondary
  - [x] audit empty: 用 history icon + 描述
  - [x] typecheck 5/5 全过
- **evidence**:
  - 截图 `.review-evidence/firefly-mesh-ui/04-knowledge-after.png`
  - 视觉：upload icon + heading + 详描述 + 橙色 primary CTA

### P1-B: TopBar 全局 search (cmdk) + org switcher dropdown

- **status**: ✅ done (org switcher 推迟到多 org 场景启用)
- **入口文件**: `packages/web/components/layout/app-shell.tsx` + 新建 `packages/web/components/layout/command-palette.tsx`
- **acceptance_criteria**:
  - [x] 装 `cmdk` 包
  - [x] TopBar Search 按钮启用 — 点击或 ⌘K/Ctrl+K 触发 command palette dialog
  - [x] command palette 内容：6 dashboard 页面跳转 + Sign out
  - [x] cmdk 内置 fuzzy search，type 时实时过滤
  - [x] esc 关闭，再按 ⌘K toggle
  - [ ] Toggle theme command — 推迟到 P2-B (next-themes) 完成后接进来
  - [ ] org switcher dropdown — 推迟到 `/api/me/switch-org` endpoint + 多 org 场景实装
  - [x] typecheck 全过
- **evidence**:
  - 视觉：TopBar Search 按钮文字 "Search or jump to…" + ⌘K 角标显示
  - 功能：⌘K 弹 dialog，input + 6 nav items + sign out

### P1-C: Settings 加 change password + avatar upload

- **status**: pending
- **入口文件**: `packages/web/app/(dashboard)/settings/page.tsx`
- **acceptance_criteria**:
  - [ ] Account section 加"Change password" 按钮 → 弹 dialog (current pw + new pw + confirm) → 调 better-auth `authClient.changePassword`
  - [ ] Account section 加 avatar 上传 → file picker → POST 到 `/api/upload/avatar` (新建 endpoint，存到本地 `var/avatars/` 像 KB 一样)；返回 url 后 PUT /api/me 设 avatarUrl
  - [ ] 取消 avatar 时 fallback 回 initials
  - [ ] typecheck 全过

---

## P2 — Polish

### P2-A: AppShell 头像链接 `/settings/account` 改为 `/settings`，删 redirect

- **status**: pending
- **入口文件**: `packages/web/components/layout/app-shell.tsx` line ~112 + 删除 `app/(dashboard)/settings/account/page.tsx`
- **acceptance_criteria**:
  - [ ] AppShell 头像 href 改成 `/settings`
  - [ ] 删 settings/account 目录
  - [ ] typecheck 全过

### P2-B: dark mode toggle

- **status**: pending
- **入口文件**: `packages/web/components/layout/app-shell.tsx` + `packages/web/components/providers.tsx`
- **acceptance_criteria**:
  - [ ] 装 `next-themes`
  - [ ] Settings page 加 theme select (system / light / dark)
  - [ ] AppShell 加 quick toggle icon (sun / moon)
  - [ ] tailwind dark: classes 在所有页面正确应用（已存在 globals.css 暗色 token）
  - [ ] typecheck 全过

### P2-C: Sidebar 顺序按 ui.md §1 重排

- **status**: pending
- **入口文件**: `packages/web/components/layout/app-shell.tsx` NAV_ITEMS
- **acceptance_criteria**:
  - [ ] 顺序：Inbox / Audit / Organization / Knowledge / Skills / Settings (Audit 紧跟 Inbox)
  - [ ] typecheck 全过

---

## 总验收 (修完后跑)

- [ ] `pnpm -r typecheck` 5/5 全过
- [ ] 重跑 `/autodev-review --target ui`，6 页平均分 ≥ 7.5/10
- [ ] 6 张回归截图 saved to `.review-evidence/firefly-mesh-ui/0X-after.png`
- [ ] git log 每个 task 一个 commit (commit msg 格式 `fix(ui): {task-id} — {brief}`)
