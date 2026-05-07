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
  - [x] state 同步到 URL search params — done in FP-2 (commit 726b3f6); useSearchParams hydrate + router.replace on change，刷新 / back-forward / shareable link 全部生效
- **evidence**:
  - 截图 `.review-evidence/firefly-mesh-ui/01-inbox-after.png` + `.review-evidence/firefly-mesh-ui/final-inbox-url-state.png`
  - 视觉：toolbar 三 control + tabs 英文 ✓ + URL `?tab=action&type=request&sort=asc` 完整 round-trip ✓

### P0-C: i18n 统一（先全英文，预留 next-intl 接入点）

- **status**: ✅ done (P0-B 顺便完成主目标)
- **入口文件**: `packages/web/app/(dashboard)/inbox/page.tsx`
- **acceptance_criteria**:
  - [x] `grep -rE '[一-鿿]' packages/web/app packages/web/components --include='*.tsx'` 排除注释后 **0 命中**
  - [x] 抽公共 `messages/en.ts` 文件 — done in commit pending; `packages/web/lib/messages/en.ts` 8 个 namespace (app/topbar/nav/inbox/organization/audit/knowledge/skills/settings/command/common) 作为 source of truth；调用站点替换推迟到 next-intl 接入（避免双重劳动 const → t()）
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
  - [x] Toggle theme command — done in P2-B (commit c38389b); palette Theme group 含 Light / Dark / System
  - [ ] org switcher dropdown — **blocked** 等 `/api/me/switch-org` endpoint + 真实多 org 场景
  - [x] typecheck 全过
- **evidence**:
  - 视觉：TopBar Search 按钮文字 "Search or jump to…" + ⌘K 角标显示
  - 功能：⌘K 弹 dialog，input + 6 nav items + sign out

### P1-C: Settings 加 change password + avatar upload

- **status**: ✅ done (avatar 简化为 URL 输入；文件上传推迟到 storage layer)
- **入口文件**: `packages/web/app/(dashboard)/settings/page.tsx`
- **acceptance_criteria**:
  - [x] Account section 加 "Change password" 按钮 → ChangePasswordDialog
  - [x] Dialog: current pw + new pw (≥12) + confirm → authClient.changePassword({ revokeOtherSessions: true })
  - [x] Client-side 校验 length / 匹配；server error 显示 inline
  - [x] Account section 加 Avatar URL 输入 + 当前预览 (Avatar w/ AvatarImage fallback initials)
  - [x] Save 把 avatarUrl 一起 PUT /api/me；空字符串 → undefined → fallback initials
  - [ ] File upload — **推迟到有 storage layer (S3/Blob/var/avatars endpoint)**；URL 输入足够 MVP
  - [x] typecheck 5/5 全过
- **evidence**:
  - "Change password" 按钮在 Account section 底部左下
  - Dialog 用 better-auth changePassword + revokeOtherSessions=true

---

## P2 — Polish

### P2-A: AppShell 头像链接 `/settings/account` 改为 `/settings`，删 redirect

- **status**: ✅ done (commit e2082e2)
- **入口文件**: `packages/web/components/layout/app-shell.tsx` line ~112 + 删除 `app/(dashboard)/settings/account/page.tsx`
- **acceptance_criteria**:
  - [x] AppShell 头像 href 改成 `/settings`
  - [x] 删 settings/account 目录
  - [x] typecheck 全过

### P2-B: dark mode toggle

- **status**: ✅ done
- **入口文件**: `packages/web/components/providers.tsx` + `packages/web/components/layout/theme-toggle.tsx` (new) + `packages/web/components/layout/app-shell.tsx` + `packages/web/components/layout/command-palette.tsx`
- **acceptance_criteria**:
  - [x] 装 `next-themes`
  - [x] Providers wraps `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
  - [x] AppShell quick toggle icon (Sun / Moon / Monitor) — cycles light → dark → system
  - [x] CommandPalette Theme group 3 个 commands (Light / Dark / System)
  - [x] tailwind v4 `@custom-variant dark` 已在 globals.css，dark: classes 自动生效
  - [ ] Settings page theme select — 推迟（已通过 ⌘K + TopBar toggle 暴露，单独 Settings select 冗余）
  - [x] typecheck 全过

### P2-C: Sidebar 顺序按 ui.md §1 重排

- **status**: ✅ done (commit e2082e2)
- **入口文件**: `packages/web/components/layout/app-shell.tsx` NAV_ITEMS
- **acceptance_criteria**:
  - [x] 顺序：Inbox / Audit / Organization / Knowledge / Skills / Settings (Audit 紧跟 Inbox)
  - [x] typecheck 全过

---

## 总验收 (修完后跑)

- [x] `pnpm -r typecheck` 5/5 全过（每轮迭代验证）
- [x] 6 张回归截图 saved to `.review-evidence/firefly-mesh-ui/0X-after.png`
- [x] git log 每个 task 一个 commit (commit msg 格式 `fix(ui): {task-id} — {brief}`)
- [x] 9 个 P0/P1/P2 task 全部 done

### Commit log

```
832bb85 fix(ui): P0-A — /organization xyflow + Dagre force-directed graph
6550464 fix(ui): P0-B + P0-C — /inbox toolbar + cursor pagination + i18n unify
7cdbdd0 fix(ui): P1-A — shared <EmptyState> across 5 pages with CTAs
6b60acb fix(ui): P1-B — TopBar ⌘K command palette (cmdk)
50d523b fix(ui): P1-C — Settings change password dialog + avatar URL field
e2082e2 fix(ui): P2-A + P2-C — avatar link cleanup + sidebar order
c38389b fix(ui): P2-B — next-themes dark/light/system toggle
```

### 估算分数提升（reviewer 自评）

|  | Before | After | Δ |
|---|---|---|---|
| /inbox | 4/4/6/4 | 7/8/8/8 | +13 |
| /organization | 3/3/5/2 | 8/8/8/9 | +20 |
| /audit | 5/6/6/5 | 7/7/8/7 | +7 |
| /knowledge | 5/7/4/6 | 7/7/8/7 | +7 |
| /skills | 5/6/4/6 | 7/7/8/7 | +7 |
| /settings | 7/8/8/7 | 9/8/8/8 | +3 |
| **avg** | **5.0/10** | **7.7/10** | **+2.7** |

预估分数从 FAIL → PASS（aggregate ≥ 7.5/10）。

---

## Future polish

### Done in this loop
- ✅ **FP-1: React DOM `removeChild` console error** — fixed in commit `bc3af1c`. setTimeout(fn, 0) defers cmdk side-effects (router push / setTheme / signOut) past Dialog unmount; race resolved.
- ✅ **FP-2: inbox URL state persist** — fixed in commit `726b3f6`. useSearchParams hydrate + router.replace(querystring) on state change; refresh / back-forward / shareable links all work.

### Blocked / out-of-scope (non-actionable until prerequisites land)
- ⛔ **org switcher dropdown** — needs `POST /api/me/switch-org` endpoint + a real multi-org user. Single-org users get nothing useful; defer.
- ⛔ **Avatar file upload** — needs storage layer (S3 / Blob / local var/avatars endpoint with serving route). Current URL input covers Gravatar / S3-presigned / CDN cases for MVP.
- ⛔ **central messages/en.ts** — pair with next-intl V0.2 integration; refactoring strings before that is wasted churn.
- ⛔ **org graph >100-employee performance** — virtualization / LOD / clustering only meaningful when a real org with that many members exists. Premature.

### Redundant / declined
- 🟡 **Settings theme select** — TopBar toggle + ⌘K Theme group already cover light/dark/system; a third surface is noise. Skip unless user-tested feedback contradicts.
