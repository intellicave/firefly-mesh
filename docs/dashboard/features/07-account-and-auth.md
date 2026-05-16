# Feature 07 — 账户与登录

> 本文档**只描述功能**。数据 / 接口 / 实现 / 迁移见 `_archive/07-tech-draft.md`。

---

## 1. 是什么

账户与登录是 Firefly Mesh 的**身份门** — 让一个"人"在平台上拥有可信、可恢复、可治理的数字身份。
- **注册** — 邮箱密码 / Google OAuth / GitHub OAuth 三种入口
- **登录 / 登出** — 维护 session cookie(跨子域共享 .firefly-mesh.com)
- **个人设置** — 改头像 / 改名字 / 改密码 / 管理 active sessions / 切换语言

整个身份基础设施委托给 **Better Auth**(已部署),dashboard 这一侧只做 UI + 关键体验细节(防猜测错误文案、跨域 callbackURL、session 管理)。

**3 个 UI 模块**:
1. `/signup` — 创建账号
2. `/login` — 已有账号登入
3. `/settings` — 账户管理(Profile / Security / Preferences 三 tab)

**谁会用**:所有人。

**核心安全原则**:
- 错误信息**不暴露**:不告诉攻击者"邮箱不存在"(避免账号枚举)
- 跨子域 cookie:**一份 cookie 走遍 dashboard + hub**(详见 [`../reference/auth-cookie.md`](../reference/auth-cookie.md))
- OAuth callbackURL **必须绝对 URL**(否则会落到 hub 域,这是历史 bug)
- HttpOnly cookie + SameSite=Lax + Secure → XSS 无法读 token,CSRF 默认防

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | New user — email signup | `firefly-mesh.com` → [Get started free] → 跳 `/signup` → 填 name/email/password → Create account → 后端写 user + 创建 session,**cookie 立即跨 firefly-mesh.com 共享** → 跳 `/onboarding/create-org`。 |
| 2 | New user — Google OAuth | `/signup` → [Continue with Google] → 跳 Google → 授权 → Google 回调到 `hub.firefly-mesh.com/api/auth/callback/google`(账号信息 + cookie 写入)→ 302 回 `app.firefly-mesh.com/onboarding` → 我在 dashboard 域。 |
| 3 | Returning user — quick login | `/login` → Continue with GitHub → 浏览器记得我授权过 → 1 秒回 dashboard → 跳 `/inbox`(已有 tenant 的)或 `/onboarding`(还没的)。 |
| 4 | Forgotten browser session | 我在咖啡店登录了一次,回家发现笔记本还在那里。我去 `/settings/security` → Active sessions 列出 4 个,"Chrome on MacBook · this session" + "Safari on iPhone · 2d ago" + "**Chrome on Windows · in Tokyo · 4h ago**"(咖啡店那台)→ 点 [Sign out] → 那个 session 被 revoke,下一次该 browser 访问任何 firefly-mesh 子域时 cookie 失效。 |
| 5 | Change password | `/settings/security` → 输 current password → 新密码 + 确认 → [Update password] → 改完。我也可以选 [Sign out other sessions]——把当前 session 之外的所有踢掉(适用于"密码被泄露"场景)。 |
| 6 | Language toggle | 顶部 user menu 显示当前语言"中"。我点 → 下拉"中 / English" → 切到 English → 整个 UI 立即换文案(useT() hook 触发)→ 写入 localStorage → 刷新仍记得。 |
| 7 | Theme change (V1.5) | V1 默认跟随系统 dark/light。V1.5 加 Settings → Preferences → Theme 切换器(System / Light / Dark)。 |
| 8 | Avatar | V1 我的头像直接用 Google / GitHub provider 的(`user.image` 字段);上传自定义头像留到后续。我看 Settings → Profile → 头像旁的 [Change] 按钮目前显示 "(Coming soon — currently using Google avatar)" 灰色。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | 错误密码 → "Invalid email or password"(不区分"邮箱不存在"和"密码错"——避免账号枚举攻击)。但**注册时**可以告知 "Email already in use"(注册不构成枚举攻击,因为注册者本就有这个邮箱)。 |
| E2 | OAuth 失败(用户取消 / provider 报错)→ 回 dashboard URL 带 `?error=oauth_canceled` → 顶部红 banner "OAuth sign-in failed: <reason>. Try again." |
| E3 | Cookie 过期(7 天默认)→ 任何页面下次操作 401 → 自动跳 `/login?next=<当前path>` → 重登后自动跳回原页 + 自动重放被 401 拦截的请求(V1.5 加)。 |
| E4 | 浏览器拒绝 cookie(用户隐私模式严格)→ 登录后立即被踢回 `/login` 形成死循环 → V1 检测此情况后顶部红条 "Cookies are blocked. Enable for firefly-mesh.com to sign in." |
| E5 | OAuth provider 标记账号 unverified(Google 提示"this email is unverified")→ Better Auth 默认仍允许;V1 接受;V1.5 可加强制邮箱验证 toggle。 |
| E6 | 用户两个 tab 同时操作,一个 logout → 另一个 tab 在某操作时 401 → 自动跳 login。 |
| E7 | 用户在 `/settings` 改了 name 还没 save 就关闭 tab → 改动丢失,V1 接受;V1.5 加 sticky banner "Unsaved changes · [Save]"。 |

---

## 3. UI 入口与界面

### 路由

- `/signup` — 注册(公开)
- `/login` — 登录(公开)
- `/settings` — 默认 Profile tab(登录)
- `/settings?tab=security` — Security tab
- `/settings?tab=preferences` — Preferences tab

### `/signup`

```
                          ┌─────────────────────────────────────────┐
                          │  Firefly Mesh                           │
                          │                                         │
                          │  Create your account                    │
                          │  Already have an account? Sign in       │
                          │                                         │
                          │  ┌─────────────────────────────────────┐│
                          │  │  G  Continue with Google            ││
                          │  └─────────────────────────────────────┘│
                          │  ┌─────────────────────────────────────┐│
                          │  │  ⓖ  Continue with GitHub            ││
                          │  └─────────────────────────────────────┘│
                          │                                         │
                          │  ─────────── or ───────────             │
                          │                                         │
                          │  Name                                   │
                          │  [______________________________]       │
                          │                                         │
                          │  Email                                  │
                          │  [______________________________]       │
                          │                                         │
                          │  Password                               │
                          │  [______________________________]       │
                          │  At least 8 characters                  │
                          │                                         │
                          │  [ Create account ]                     │
                          │                                         │
                          │  By signing up you agree to our         │
                          │  Terms · Privacy                        │
                          └─────────────────────────────────────────┘
```

### `/login`

```
                          ┌─────────────────────────────────────────┐
                          │  Firefly Mesh                           │
                          │                                         │
                          │  Welcome back                           │
                          │  No account? Sign up                    │
                          │                                         │
                          │  [  G  Continue with Google  ]          │
                          │  [  ⓖ  Continue with GitHub  ]          │
                          │                                         │
                          │  ─────────── or ───────────             │
                          │                                         │
                          │  Email                                  │
                          │  [______________________________]       │
                          │                                         │
                          │  Password                               │
                          │  [______________________________]       │
                          │  Forgot password? · (Coming soon)       │
                          │                                         │
                          │  [ Sign in ]                            │
                          └─────────────────────────────────────────┘
```

### `/settings` Profile tab

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Settings                                                              ⌘K  │
│  [Profile] [Security] [Preferences]                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────┐                                                                   │
│   │  👤  │  Alice K                                                          │
│   │ 头像 │  alice@acme.com  (verified ✓)                                     │
│   └──────┘  [Change avatar]  (Coming soon — using Google avatar)             │
│                                                                              │
│  Name                                                                        │
│  [Alice K_______________________________]                                    │
│                                                                              │
│  Email                                                                       │
│  alice@acme.com                                                              │
│  (Cannot be changed — contact support)                                       │
│                                                                              │
│  Joined                                                                      │
│  2026-01-12 · 4 months ago                                                   │
│                                                                              │
│  [Save changes]                                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### `/settings?tab=security`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Profile] [Security] [Preferences]                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  Password                                                                    │
│                                                                              │
│  Current password   [______________________]                                 │
│  New password       [______________________]   8+ characters                 │
│  Confirm            [______________________]                                 │
│                                                                              │
│  [Update password]                                                           │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  Active sessions                                                             │
│                                                                              │
│  ▣ Chrome on MacBook · in San Francisco                                      │
│    Current session · started 2 hours ago                                     │
│                                                                              │
│  ▣ Safari on iPhone · in Berkeley                                            │
│    Started 2 days ago · last seen 10 min ago                  [Sign out]    │
│                                                                              │
│  ▣ Chrome on Windows · in Tokyo                                              │
│    Started 4 hours ago · last seen 30 min ago                 [Sign out]    │
│                                                                              │
│  [Sign out everywhere except current]                                        │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  Two-factor authentication                                                   │
│  (Coming in a future update)                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### `/settings?tab=preferences`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Profile] [Security] [Preferences]                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  Language                                                                    │
│  ◯ English                                                                   │
│  ● 中文                                                                       │
│                                                                              │
│  Time zone                                                                   │
│  Automatically detected: Asia/Shanghai (GMT+8)                               │
│  Switch:  [ Asia/Shanghai ▾ ]                                                │
│                                                                              │
│  Theme                                                                       │
│  ◯ Light                                                                     │
│  ◯ Dark                                                                      │
│  ● Follow system  (currently: Light)                                         │
│                                                                              │
│  Notifications                                                               │
│  ☑ Email me when an external agent sends a high-priority message            │
│  ☐ Email me weekly inbox summary                                            │
│                                                                              │
│  [Save preferences]                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Signup/Login default** | 进页面 | form 可填 |
| **OAuth start** | 点 Continue with Google/GitHub | 浏览器跳转到 provider |
| **OAuth callback** | 跳回 dashboard | 短暂 spinner overlay → 自动跳 inbox / onboarding |
| **Signup submitting** | 点 Create account | 按钮 spinner "Creating account…" |
| **Login submitting** | 点 Sign in | 按钮 spinner "Signing in…" |
| **Signup success** | 后端 201 | router push `/onboarding` |
| **Login success (has tenant)** | session 写入 + tenants 长度 ≥ 1 | router push `/inbox` |
| **Login success (no tenant)** | session 写入 + tenants 长度 == 0 | router push `/onboarding` |
| **Login error: wrong creds** | 后端 401 | form 下方红字 "Invalid email or password" |
| **Signup error: email in use** | 后端 409 | form 下方红字 "Email already in use" |
| **OAuth error** | URL `?error=...` | 顶部红 banner 显示错误 + [Try again] |
| **Cookie blocked** | 登录后立刻 401 循环 | 顶部红条 "Cookies are blocked. Enable for firefly-mesh.com to sign in." |
| **Logged-in accessing /login** | session 存在 + 访问 /login | router push `/inbox` |
| **Settings Profile loading** | 进 /settings | form 字段 skeleton |
| **Profile save submitting** | 点 Save changes | 按钮 spinner |
| **Profile save success** | 后端 200 | toast "Saved" + 顶部 user menu 头像/名同步更新 |
| **Password change error: wrong current** | 后端 401 | form 下方红字 "Current password incorrect" |
| **Password change error: new too short** | 客户端校验 | 红字 "Password too short (min 8)" |
| **Password change success** | 后端 200 | toast "Password updated";询问 "Sign out other sessions?" |
| **Sign out one session** | 点行内 [Sign out] | 该行淡出 + toast "Session ended" |
| **Sign out everywhere** | 点底部按钮 | confirm dialog → 所有非 current sessions 失效;current 不变 |
| **Logout (current)** | 顶部 user menu Sign out | router push /login + cookie 立即清 |
| **Language toggle** | Preferences 改 + Save | useT() 切换文案 + localStorage 写入 |
| **Theme toggle** | Preferences 改 | next-themes 切换 + 应用到 :root + 持久化 |
| **Network offline** | 任何操作时 | 按钮灰显 + 顶部红条 |

---

## 5. 杀手锏功能 ⭐

### 5.1 防猜测的错误文案("Invalid email or password")

登录时,不告诉攻击者"邮箱不存在"——这是**账号枚举攻击**的标准入口(攻击者用列表试探哪些邮箱注册过)。
- 错误密码:**"Invalid email or password"**(不区分两种错)
- 找不到邮箱:同上
- 账号被锁:同上(V1.5 加 lockout)
- 注册:**可以**告知"Email already in use"(因为注册者本就提供了邮箱,不构成攻击 surface)

这是**安全 + UX** 的微妙平衡:登录稍微难诊断,但攻击难度提高。

### 5.2 Active sessions 地点 + 设备识别

`/settings/security` 列出所有 active sessions,每个显示:
- **设备**:Chrome on MacBook / Safari on iPhone / curl(API only)
- **地点**:基于 IP geolocation(国家 + 城市)
- **started**:session 创建时间
- **last seen**:最近活动时间(从 last request 时间推算)
- **是不是 current session**:本 session 永远高亮在顶,带 "Current session" 徽标

价值:**异常登录立刻看见**。如果我从来没去过 Tokyo,但列表里有"Chrome on Windows · in Tokyo · 4h ago",我立刻 [Sign out] 那个 session 并改密码。

### 5.3 [Sign out everywhere except current]

密码泄漏 / 借用电脑 / 旅行后,需要"一键清"所有非当前 session。
按钮单独列出在 Active sessions 区块底部,**不和"修改密码"绑定**(避免修改密码强制踢全部 — 太重)。
点击 → confirm → 后端 revoke 除 current 外的所有 session → current 不动。
配合 password change 时弹"也踢全部其他 session?"的问询,形成完整安全工具组。

### 5.4 跨子域 Cookie(一份走遍 dashboard + hub)

技术细节但**用户体验关键**:
- cookie 域设为 `.firefly-mesh.com`(注意前导点)
- dashboard (`app.firefly-mesh.com`)写入 / 读取 / hub (`hub.firefly-mesh.com`)写入 / 读取,共享同一份 session token
- 后果:**login 一次,所有 firefly-mesh.* 子域都登录了**

对比常见错误:子域各自一份 cookie,user 在 dashboard 登录后调 hub API 还要再 401 一次。我们设计上避免。
**这条做对了用户无感知;做错了产品基本不可用**(P0 必修)。

### 5.5 OAuth callbackURL 绝对 URL(防域名漂移)

`signIn.social({ callbackURL })` 必须传**绝对 URL**(`${window.location.origin}/onboarding`),而非相对路径 `/onboarding`。
原因:相对路径被 Better Auth 解析时基于 baseURL(= hub 域),结果回跳到 `hub.firefly-mesh.com/onboarding`——404,因为 hub 上没那个 page。
**历史 bug 真出过这条**,V1 文档强制说明。

### 5.6 Language toggle 即时生效

顶部 user menu 的 "中 / EN" 切换不需要 Save:
- 点击立即应用(useT() hook subscribers 全部重渲染)
- localStorage 立即持久
- 跨页面 / 跨刷新 / 跨子域都保留(每个域各自的 localStorage,但内容一致)

体验感:**国际化是一等公民,不是设置项里藏的**。

---

## 6. 交互细节

- **键盘**:
  - signup/login form `↵` = Submit
  - settings 各 tab 内 `⌘S` = Save changes(若有未保存)
  - `Esc` 关闭 OAuth provider popup(若是 popup 模式)
- **OAuth 模式**:V1 用 full redirect(不是 popup),避免 popup blocker 问题
- **Password input**:[显示/隐藏] 眼睛按钮 inline 切换 type=password ↔ text
- **Password strength meter**:V1 不做(只在 8+ 校验);V1.5 加(zxcvbn 库)
- **Avatar 来源**:OAuth provider 头像优先(`user.image` 由 Better Auth 自动填);若 user 是邮箱注册 → 默认 placeholder(initial-based avatar,e.g. "AK" 大写两字母 + 随机色)
- **OAuth scopes**:Google 请求 email + profile;GitHub 请求 user:email + read:user。不请求多余 scope(信任建立)
- **i18n**:错误文案、按钮、tab 名全 i18n;Better Auth 内部错误码也映射到 i18n key
- **Time zone display**:Active sessions 时间显示"2 hours ago"(相对)hover 出绝对(用户本地时区)
- **Email verification**:V1 不强制(Better Auth 默认 email_verified=false 也允许登录);V1.5 可加 toggle 强制
- **Forgot password**:V1 显示 "Forgot password? (Coming soon)" 灰色;V1.5 实现邮件流(需 SMTP)
- **Two-factor**:V1 不做;V1.5 加 TOTP

---

## 7. 边界与异常路径

- **账号枚举防御**:登录错误统一 "Invalid email or password"
- **Cookie 阻塞**:detect 后顶部红条 "Cookies are blocked. Enable for firefly-mesh.com"
- **OAuth 错误码标准化**:`?error=oauth_canceled` / `?error=oauth_provider_error` / `?error=oauth_token_expired` 等,UI 映射到友好文案
- **登录后 token 立即过期**:V1.5 加 silent refresh(Better Auth 已支持);V1 接受 7 天 expiry
- **跨子域 cookie 配错**(域不带 `.`)→ dashboard 登录后调 hub 401 循环;DevTools cookie 验证是开发必查
- **OAuth provider 邮箱与现有 user 邮箱冲突**(同邮箱不同 provider 注册)→ Better Auth 默认行为是"merge"(关联现有 user 的 OAuth account 字段);V1 接受
- **密码改成 same as current**:前端校验"New password must be different"
- **改密码 + 同时其他 session 操作**:其他 sessions 仍持原 token,V1 不主动踢 — 用户可选 [Sign out other sessions]
- **OAuth refresh token expired**:Better Auth 自动尝试 refresh;失败则当 session expired 处理 → 跳 login
- **Sign out 双 tab 一致性**:tab A logout 后 tab B 在某操作时 401 → 自动跳 login(不强制 BroadcastChannel 同步,简单优先)
- **删除账号**:V1 不支持自删除(企业账号);通过 support 走删号流程
- **导入 OAuth user 时缺名字**(provider 不给)→ 默认用 email 前缀("alice@acme.com" → name="alice"),user 可在 Profile 改
- **session 数据敏感**(IP / user_agent / geo)→ V1 仅自己可见;不在 audit log 中显示给 admin

---

## 8. 开放问题

- **邮箱验证**:V1 不强制,V1.5 启用。**决策**:V1 首次注册阻力优先,后续邮件营销时再补。
- **Forgot password**:V1 不实现(需 SMTP)。**决策**:V1 通过 OAuth 兜底(密码用户少);V1.5 接 Resend / Mailgun。
- **2FA / TOTP**:V1.5。**决策**:V1 不卡在企业市场常规要求;V1.5 出。
- **改邮箱**:V1 不允许 UI 改(走 support)。**决策**:邮箱是 OAuth 关联键 + 邀请匹配键,改动复杂,V1 接受局限。
- **头像自定义**:V1 OAuth provider 头像 + initial-based fallback。**决策**:V1.5 上传到 R2。
- **默认进入哪个 tenant**:多 tenant 用户登录后默认看哪个?V1 = `MIN(joined_at)`(最早加入的);V1.5 加 settings "Default tenant" toggle。
- **session timeout 配置**:V1 = 7 天硬编码。**决策**:V1.5 可让 admin per-tenant 配(security-conscious orgs 要求短期 session)。
- **IP geolocation 数据源**:V1 用 Cloudflare 自带 cf-ipcountry header + 城市级用 IP API。**决策**:V1 接受 city-level 精度(不必精到街区)。
- **Active session 实时 push**:别处登录时,当前 sessions 列表自动刷新?V1 不做 WS push;V1.5 加。
- **设备识别精度**:从 user_agent parse Chrome/Safari/Firefox + macOS/Windows/iOS,V1 用 ua-parser-js 库。准确度 ~95%,够用。
- **Theme**:V1 = 跟随系统(默认 light 多)。**决策**:V1.5 加 light/dark/system 选项 + 持久化。
