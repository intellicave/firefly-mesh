# Migration 01 — 还原 v0 代码到 `services/dashboard/`

> 把归档的 Next.js dashboard 取回来,放到 `services/dashboard/`,但**先不改任何代码**(那是下一步)。

预计耗时:**0.5 天**。

---

## 1. 前置条件

- [ ] 当前位于 main 分支,工作树干净
- [ ] 阅读完 [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §D1 和 §D6(知道为什么保留 Next.js + 哪些 server-only 特性要改)
- [ ] 已有 `legacy/v0/packages/web/` 目录(归档位置)

```bash
ls legacy/v0/packages/web/app  # 应该看到 (dashboard) / api / login / onboarding / signup ...
```

---

## 2. 创建 worktree(可选,推荐)

```bash
git checkout -b feat/restore-dashboard
mkdir -p .worktrees
git worktree add .worktrees/restore-dashboard feat/restore-dashboard
cd .worktrees/restore-dashboard
```

(确保 `.worktrees/` 在 `.gitignore` 中)

---

## 3. 移动代码

```bash
git mv legacy/v0/packages/web services/dashboard
```

如果 `legacy/v0/packages/` 下还有别的(应该没有),保留;空了就删:
```bash
rmdir legacy/v0/packages 2>/dev/null
rmdir legacy/v0 2>/dev/null
```

确认结构:
```
services/dashboard/
├── app/
│   ├── (dashboard)/   ← inbox / organization / knowledge / skills / audit / settings
│   ├── api/           ← 48 个 route.ts (本 migration 不动,migration 02 才删)
│   ├── login/
│   ├── signup/
│   ├── onboarding/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
├── lib/
├── public/
├── package.json
├── next.config.js
├── tsconfig.json
└── tailwind.config.ts
```

---

## 4. 修剪 next.config.js (server-only 特性)

`services/dashboard/next.config.js` 改:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,   // ← Cloudflare Pages 不支持 next/image 默认 loader
  },
}
module.exports = nextConfig
```

去掉(若有):
- `images: { domains, loader: 'default', ... }`
- `serverActions` 相关(走 hub 不走 server action)
- `experimental.runtime`
- 任何 `webpackDevMiddleware` 自定义

---

## 5. 每个 route 显式声明 edge runtime

next-on-pages 要求每个 route 在文件顶部声明:
```ts
export const runtime = 'edge'
```

对 `app/(dashboard)/*/page.tsx` 和 `app/*/page.tsx` 全部加上(本步骤可机械批量):

```bash
# 检查现有声明
grep -rl "export const runtime" services/dashboard/app | wc -l
```

如果整体未声明,写个 codemod 脚本(单次,放 `scripts/add-edge-runtime.mjs`):
```js
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
      const c = readFileSync(p, 'utf8')
      if (!c.includes("export const runtime")) {
        writeFileSync(p, "export const runtime = 'edge'\n\n" + c)
      }
    }
  }
}
walk('services/dashboard/app')
```

跑一次,提交。

---

## 6. 装依赖

```bash
cd services/dashboard
pnpm install
```

预期(从 `package.json` 拉):next 14、react 18、shadcn 依赖、tailwind、tanstack-table、lucide-react、react-markdown 等。

可能要补:
```bash
pnpm add better-auth
pnpm add -D @cloudflare/next-on-pages wrangler
```

---

## 7. 加 `wrangler.toml` (dashboard 专用)

`services/dashboard/wrangler.toml`:

```toml
name = "firefly-mesh-dashboard"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vercel/output/static"

# 没有 D1/DO/KV 绑定 — dashboard 不直连数据
# 仅需 public env
[vars]
NEXT_PUBLIC_HUB_URL = "https://hub.firefly-mesh.com"
NEXT_PUBLIC_PWA_URL = "https://firefly-mesh.com"
```

---

## 8. 验证编译

```bash
cd services/dashboard
pnpm next build       # 标准 next build,先确认 v0 代码本身能编
```

预期:可能有些 server-only 特性报错(server action / next/image / route 实现细节),先记下来,**不要在本 migration 修复**(那是 migration 02 的事)。

如果普通 `next build` 通过,跑 next-on-pages:
```bash
pnpm dlx @cloudflare/next-on-pages
```

任何失败都记到 `services/dashboard/MIGRATION-NOTES.md`(临时文件,后续删)。

---

## 9. 提交

```bash
git add services/dashboard/
git commit -m "feat(dashboard): restore v0 Next.js dashboard from legacy/

Restores the archived v0 dashboard (Next.js 14 + shadcn) to
services/dashboard/. Adds edge runtime markers and trims
unsupported next.config.js options. Code is not yet rewired
to call hub — see migration/02-rewire-fetch.md."
```

---

## 10. 完成标志

- [ ] `services/dashboard/` 存在,有完整 v0 目录
- [ ] `legacy/v0/` 已删
- [ ] `pnpm install` 在 `services/dashboard/` 成功
- [ ] `pnpm next build` 至少能跑(允许 server action 等小报错,后续修)
- [ ] commit message 引用本文件
- [ ] 走向下一步:[`02-rewire-fetch.md`](02-rewire-fetch.md)

---

## 11. 故障排查

| 症状 | 处理 |
|---|---|
| `next build` 报 `Module not found` | 缺依赖,`pnpm install` 再确认 |
| `next/image` 警告 | 已在 §4 设 `unoptimized: true`,警告可忽略 |
| Route 用了 `cookies()` 等 server-only API | 留到 migration 02,改成 fetch hub |
| TypeScript strict 报错 | 这是 v0 历史代码,允许暂时 `// @ts-ignore` 或 `tsconfig.json` 中暂关 `strict`,后续修 |
