# Web Migration A — Design

## 1. 架构影响

| 层 | 变化 |
|---|---|
| services/hub | **不动**（不改任何路由 / 中间件 / schema） |
| services/web | **新建**（cp -r legacy/v0/web） |
| services/pwa | **不删**（B sprint 删）；只读 i18n |
| legacy/v0 | 不动 |
| pnpm workspace | +1 包 `@firefly-mesh/web` |

## 2. Fetch 重定向（核心改动）

### 2.1 lib/api-client.ts

**改动 1 处** — line 33-44 的 fetch 部分：

```typescript
// before
const init: RequestInit = {
  method: opts.method ?? "GET",
  credentials: "same-origin",
  ...
};
const res = await fetch(path, init);

// after
const init: RequestInit = {
  method: opts.method ?? "GET",
  credentials: "include",           // ← 跨域 cookie
  ...
};
const hub = process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:8787";
const res = await fetch(`${hub}${path}`, init);  // ← prepend hub URL
```

### 2.2 lib/auth-client.ts

**改动 1 处** — baseURL：

```typescript
// before
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [organizationClient()],
});

// after
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:8787",
  plugins: [organizationClient()],
});
```

### 2.3 不需要改的（关键）

- 14 个 page.tsx — **零改动**（全部通过 api() helper）
- 所有 components/*.tsx — 零改动
- 所有 hooks — 零改动
- 所有 zod schemas — 零改动

## 3. CORS + Cookie 跨域

### 3.1 当前 hub CORS

```typescript
// services/hub/src/index.ts:20-27
app.use("*", (c, next) =>
  cors({
    origin: c.env.PWA_URL,        // ← 单 origin
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })(c, next),
)
```

**问题**：dev 时 PWA_URL=`https://firefly-mesh.com`，但本地 dashboard 在 `http://localhost:3000`。

**解决方案**：本 sprint **不动 hub**，dev 时本地设环境变量 `PWA_URL=http://localhost:3000` （在 services/hub/.dev.vars）。这样 hub CORS 放行 localhost:3000。生产环境 cookie 域用 `.firefly-mesh.com`，跨子域共享 (sprint B 验证)。

### 3.2 Better Auth cookie 域

Better Auth 默认 cookie 域 = 当前 host。当 dashboard 在 `localhost:3000` 调 hub `localhost:8787` 时：
- hub set-cookie 时设 Domain=`localhost`（默认）
- 浏览器在 localhost:3000 fetch localhost:8787 时带上 cookie（同主机不同端口）—— **OK**

生产环境（sprint B）需要 hub 设置 `cookieDomain: ".firefly-mesh.com"` 才能跨子域共享。本 sprint 不涉及。

## 4. workspace 集成

### 4.1 pnpm-workspace.yaml

```yaml
packages:
  - "packages/client"
  - "packages/crypto"
  - "packages/proto"
  - "packages/shared"
  - "services/hub"
  - "services/pwa"
  - "services/web"     # ← 新增
  - "scripts/scene"
```

### 4.2 services/web/package.json

cp 后改 `name`：`@firefly-mesh/web`。版本号 0.1.0。

依赖：保留 legacy 原样（next@16 / better-auth@1.6.9 / drizzle@0.x / shadcn 等）。如果与 monorepo root 有版本冲突，**保留 services/web 自己的版本**（不向上提升），避免破坏 hub 现有依赖。

### 4.3 .env.local

```bash
# services/web/.env.local
NEXT_PUBLIC_HUB_URL=http://localhost:8787
```

### 4.4 .env.example

提交 .env.example 到 git 作为模板。

## 5. i18n 抢救

### 5.1 services/pwa/src/i18n/ 当前包含

```
en.ts            — English message dict
zh.ts            — Chinese message dict
messages.ts      — message keys + types
store.ts         — Zustand store for current locale
LanguageSwitcher.tsx — UI 组件
```

### 5.2 抢救步骤

```bash
mkdir -p services/web/lib/i18n
cp services/pwa/src/i18n/* services/web/lib/i18n/
```

适配：
- 改 import 路径（如果 LanguageSwitcher 引用了 pwa 特有的东西）
- 把 LanguageSwitcher 集成进 services/web 的 navigation 组件（app/(dashboard)/layout.tsx 或类似）
- 验证 useT() hook 在 Next.js client component 里工作

### 5.3 服务端国际化（推到 V1.1）

本 sprint 不做 server-side i18n（如根据 cookie 设 lang 渲染 server component），保持 v0 的客户端 i18n 模型。

## 6. 不动 hub（铁律）

本 sprint 100% 不改 hub 任何文件。如果发现 hub 端 cookie / CORS / 字段需要调整，**记录到 risks 文档**，留 sprint B 改。

## 7. 决策记录

| ID | 主题 | 选 | 弃 | 原因 |
|---|---|---|---|---|
| W1 | 不删 v0 server route | yes | 立即删 | sprint A 只对接 hub；删 routes 留 B |
| W2 | api-client fetch 用绝对 URL prefix | yes | 用 Next rewrites | 透明可读，避免 Next config 复杂 |
| W3 | 保留 v0 next@16 + monorepo 独立 deps | yes | 强制升级到统一版本 | 范围控制；升级 next 是独立 sprint |
| W4 | 本 sprint dev 时改 hub 的 .dev.vars 而不是 hub 代码 | yes | 改 hub CORS 代码 | 不动 hub 铁律；prod 用域名一致 |
| W5 | i18n 模型继承 pwa 客户端 Zustand | yes | 换 next-intl | 风险最低；切换成本高 |
| W6 | better-auth cookieDomain 配置推 sprint B | yes | 现在配 | 跨子域只在 prod 部署后才用到 |

## 8. 已知遗留 + sprint B 提醒

### 8.1 sprint A 完成后 services/web 状态

- 14 page.tsx 通过 api() 调 hub /api/* — **能跑**
- app/api/* 下 48 个 route.ts — **存在但不被调用** （死代码，sprint B 删）
- next.config.ts / tsconfig.json — v0 原样
- 数据库不再用（v0 Drizzle Postgres 配置文件 drizzle.config.ts 等仍在），sprint B 删
- @firefly-mesh/core 依赖 — sprint A 不卸（被 v0 server route 引用，sprint B 删）

### 8.2 sprint B 任务（不在本 sprint）

- 删 45 个 server route，留 3 个（auth/[...all] + health + well-known/agent-card.json）
- 加 @cloudflare/next-on-pages
- next.config 改 edge runtime
- 部署 Cloudflare Pages → app.firefly-mesh.com
- hub `.dev.vars` 改 `PWA_URL=https://app.firefly-mesh.com`（prod）
- hub Better Auth 加 `cookieDomain: .firefly-mesh.com`
- 删 services/pwa
- 端到端 QA 对真实生产 hub

## 9. 测试策略

### 9.1 sprint A 不加自动化测试

theme：本 sprint 是**集成**工作（不写新业务逻辑）。两个改动（fetch base URL + auth base URL）做完后，**手动 smoke test** 验证 happy path（注册 + 登录 + 看 dashboard）即可。

### 9.2 sprint B 起加 E2E

playwright e2e 测全用户旅程 — 在 sprint B 部署完后做。
