# Feature 04 — 知识管理

> 本文档**只描述功能**(产品价值 / 用户故事 / UI / 状态 / 交互 / 边界)。
> 数据模型 / 接口 / 实现 / 迁移 见 `_archive/04-tech-draft.md`,后续 layer-by-layer 单独打磨。

---

## 1. 是什么

知识管理是 Firefly Mesh 的**信息侧大脑**:
把组织内部的所有"agent 应该知道的内容"——产品 spec、销售话术、法务条款、客户档案、复盘文档、SOP——集中沉淀,并通过**边界 (boundary)** 严格控制"哪些 agent 在什么场景下能看到什么"。

它解决的痛点是:agent 越聪明,知识边界越要严。一个能调出客户信息的销售 agent,不能同时看到员工薪资;一个能写代码的工程师 agent,不能拿到法务合同。

**3 个抽象**:
- **文件夹 (folder)** — 层级分组,可嵌套,默认按 scope 顶级(Company / Department / Personal)。
- **文档 (document)** — Markdown 内容,带 tags + indexStatus(pending → indexing → ready / failed)+ size + chunkCount(知识被切分成多少块供 agent 检索)。
- **边界 (boundary)** — 一条规则:`(应用到哪些 group)` → `(允许看见哪些 folder)`。Group 可以是部门 / 角色 / 特定员工。

**谁会用**:
- **Owner / Admin**:管理一切,创建 folder、上传 document、写 boundary、做权限审查。
- **Department lead**:能管理自己部门 scope 下的 folder + document,不能改 boundary。
- **Member**:只读,且**只能看到自己 boundary 命中的 folder + document**。看不到的 folder 在树中根本不出现(不泄漏 "存在但不可访问" 这条元信息)。

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | Sales lead | 我想把"销售话术 v3"喂给销售部所有 agent。`/knowledge` → 「+ Folder」 "Sales playbook v3" → 拖 7 份 .md 文件进上传区 → 自动上传 + 后台索引(每份显示 indexing→ready) → Boundaries tab → 「+ Boundary」 "Sales access",勾 Sales playbook v3 folder,Applied to "Sales department" → Save → 销售 agent 下次检索 "客户异议" 时,top 5 命中里就有新话术。 |
| 2 | Compliance officer | 法务合同不能被工程师 agent 看到。建 Legal folder → 上传合同 PDF → boundary "Legal only",Applied to Legal department → 完成。之后,工程师在 inbox 让自己的 agent "找一下 ACME 合同条款",agent 调内置知识工具时拿到的是空结果,而非裁剪后的预览。 |
| 3 | Product manager | 我想预览一份 Q3 spec 文档。左侧 folder tree 点 "Q3 planning" → 右侧文档列表 → 点 Q3-spec → 右栏 Markdown 渲染,带语法高亮的代码块、可点击的内部链接。 |
| 4 | Engineering manager | 我想改一份过时的部署 runbook。选中文档 → 点右上「Edit」 → 渲染区切换为 textarea,顶部按钮变 [Cancel] [Save] → 行内改完 → Save → 文档头 "Updated just now",右下角浮出"Re-indexing… 12/47 chunks" → 几秒后绿色"Indexed ✓"。 |
| 5 | Researcher | 我想搜遍所有我能看到的资料,找 "竞品对比" 的内容。顶部搜索框 (⌘K) 输入 "竞品对比" → 实时下拉显示 8 条文档片段,每条带高亮匹配 + folder 来源 + 「Open」 → 点进文档,搜索词被自动滚动到位 + 黄色高亮。 |
| 6 | Junior member | 我加入了 Sales department,我能看到什么? `/knowledge` 左侧 folder tree 自动只显示 "Sales playbook" + "Public" 两个文件夹。"Eng",我看不见。"Boundaries" 这个 tab 也整个不出现 — UI 上像是没有这个能力。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | 我上传一张组织架构图截图,希望系统能解析出"谁汇报给谁",自动建好部门和员工 — 见 §5 杀手锏功能 "上传即结构化"。 |
| E2 | 我创建了一个 boundary,但忘了 Applied to 任何 group → 保存时弹出 confirm "This boundary applies to no one. Save as draft anyway?" 防止"建了规则但永远不生效"的迷惑。 |
| E3 | 两个 admin 同时编辑同一份文档 → 后保存者看到红色 banner "Charlie edited this 12s ago. View their changes or overwrite?" → 可选 diff view 解冲突。 |
| E4 | 一份文档被同时归入 2 个 boundary 的 allowed_folders,而员工属于不同 group → boundary 取**并集**(broader 更安全)。UI 上文档详情显示 "Visible via: Eng boundary + Q3 boundary" 让管理员一目了然。 |

---

## 3. UI 入口与界面

### 路由

- `/knowledge` — 主入口,默认 Documents tab
- `/knowledge?tab=boundaries` — Boundaries tab(member 看不到)
- `/knowledge?tab=sources` — Sources tab(连接外部源,**列出可连的来源**:Notion / GitHub / Google Drive / Slack,目前显示"Coming soon"占位)

### 桌面布局 — Documents tab (默认)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Knowledge                                              ⌘K Search…  [中/EN] │
│  [Documents]  [Boundaries]  [Sources]                                       │
├────────────────┬─────────────────────────────────────────────────────────────┤
│ 🏢 Company     │  Q3-planning ▾  Q3-spec  Q3-launch-checklist  ...           │
│   📁 Public    │                                                             │
│   📁 SOPs      │  ┌─────────────────────────────────────────────────────────┐│
│ 🏛 Department  │  │ # Q3 Planning Goals                                     ││
│   📁 Eng       │  │                                                         ││
│     📁 Q3-plan │  │ - Ship inbox V1 by end of Aug                          ││
│   📁 Sales     │  │ - Onboard 50 design partners                            ││
│     📁 Playbook│  │ - ...                                                   ││
│   📁 Legal     │  └─────────────────────────────────────────────────────────┘│
│ 👤 Personal    │                                                             │
│   📁 My drafts │  Tags: planning · q3       Size: 12 KB · 47 chunks · ✓     │
│                │  Updated 2d ago by Alice K                                   │
│ [+ Folder]     │  Visible via: Eng boundary + Q3 boundary                    │
│                │                                                             │
│                │  [Edit]  [Download]  [Copy share link]  [Delete]            │
└────────────────┴─────────────────────────────────────────────────────────────┘
```

- 左侧 folder tree 按 **3 scope** 顶级分组:🏢 Company / 🏛 Department / 👤 Personal。每个 scope 可独立展开收起。Member 只看到自己有权限的 scope。
- 树支持**就地展开/收起**(箭头动画 90°)、**内联重命名**(双击 folder 名)、**拖拽**(把 folder A 拖到 folder B 上 → 移动)、**多选**(Shift+click)。
- 文档列表在顶部以"breadcrumbs 形式"显示当前 folder 路径:`Eng › Q3-plan › Q3-spec`。
- 文档元信息行显示 4 个关键事实:tags、size、chunkCount(知识被切了多少块)、indexStatus(✓ ready / ⏳ indexing / ⚠ failed)。

### Sheet — Boundary 编辑器

```
              ┌──────────────────────────────────────────┐
              │ ← Eng access                             │
              │                                          │
              │ Name        [Eng access_______________]  │
              │ Description [Engineering team can ...]   │
              │                                          │
              │ Applied to ▾                             │
              │   Departments                            │
              │     ☑ Engineering                        │
              │     ☐ Sales                              │
              │     ☐ Legal                              │
              │   Roles                                  │
              │     ☑ Tech lead                          │
              │   Individuals (advanced)                 │
              │     [+ Add employee]                     │
              │                                          │
              │ Allowed folders ▾                        │
              │   🏢 Company                             │
              │     ☑ Public                             │
              │     ☐ SOPs                               │
              │   🏛 Department                          │
              │     ☑ Eng (recursive)  ◐                 │
              │     ☐ Sales                              │
              │                                          │
              │ Preview                                  │
              │ 12 people will see 47 folders / 384 docs │
              │ [Show affected people ▼]                 │
              │                                          │
              │ [Save & apply]   [Save as draft]   [✕]   │
              └──────────────────────────────────────────┘
```

亮点:
- **Preview 段**实时计算:勾选改变时,后台立刻算"这条规则上线后,X 个人能看到 Y 个 folder / Z 个文档",展开能列出受影响的人名。
- **Save as draft** vs **Save & apply** 二选项,防止"想试一下"的规则立刻生效。
- folder 旁的 ◐ 标记 "recursive"——勾上一个父 folder 默认包括所有子 folder(显示半实心圆),不勾代表只此 folder 一层(空心圆)。

### Dialog — 上传

```
        ┌──────────────────────────────────────────────────┐
        │ Upload documents                                 │
        │                                                  │
        │ Folder ▾  Sales › Playbook v3                    │
        │                                                  │
        │ ┌──────────────────────────────────────────────┐ │
        │ │  📥  Drop files here                         │ │
        │ │      or [Choose files]                       │ │
        │ │      Supports .md .txt .pdf .docx .png .jpg  │ │
        │ │      Up to 256 KB / file (V1)                │ │
        │ └──────────────────────────────────────────────┘ │
        │                                                  │
        │ Queue (3)                                        │
        │   ⏳ Q3-talktrack.md     12 KB  ━━━━━━░░ 67%     │
        │   ✓  Objections.md       8 KB   indexed ✓        │
        │   ⚠ Pricing-grid.pdf     180 KB parse failed     │
        │      Retry · Open as raw                         │
        │                                                  │
        │ Tags (apply to all) [planning] [q3] [+]          │
        │                                                  │
        │ [Cancel]                              [Upload]   │
        └──────────────────────────────────────────────────┘
```

每个文件单独显示**上传进度**、**索引状态**、**解析结果**;失败的可单独 Retry,不影响队列其他文件。

### Modal — Cross-scope search results (⌘K)

```
       ┌──────────────────────────────────────────────────┐
       │ 🔍 [客户异议__________________________] ✕         │
       │                                                  │
       │ 8 results · across 3 scopes · 0.32s              │
       │                                                  │
       │ ─ Sales › Playbook v3                            │
       │   Objection handling.md  · 12 days ago           │
       │   …常见**客户异议**包括: 1. 价格过高 2. …          │
       │                                                  │
       │ ─ Company › SOPs                                 │
       │   Sales-onboarding.md   · 3 months ago           │
       │   …新销售应对**客户异议**的 5 步流程 …             │
       │                                                  │
       │ ─ Department › Eng                               │
       │   Customer-feedback-q3.md  · last week           │
       │   …工程团队从 12 条**客户异议**中抽取…             │
       │                                                  │
       │ [Show 5 more] · [Press ↵ to open, ⌘↵ in new tab] │
       └──────────────────────────────────────────────────┘
```

---

## 4. 状态机

| 状态 | 触发 | UI 表现 |
|---|---|---|
| **Loading (initial)** | 进页面 | 左侧 folder tree skeleton(3 层灰条),右侧 spinner |
| **Empty (空 tenant)** | 没有任何 folder/document | 中央卡片 "No knowledge yet · Upload a few docs or import from Notion" + 主按钮 [Upload] + 次要按钮 [Connect a source (soon)] |
| **Empty (folder 内)** | folder 存在但无 document | "This folder is empty. Drop files here or [Browse]." |
| **Ready (默认)** | 数据已就绪 | 左侧 tree + 右侧文档详情 |
| **Selecting** | 用户点 folder 但内容仍在加载 | 右侧 spinner + breadcrumbs 已更新 |
| **Editing (document)** | 点 Edit | 渲染区切 textarea,顶部按钮变 [Cancel] [Save] |
| **Saving** | Save 提交中 | Save 按钮 spinner,document 头加 "Saving…" 灰色标签 |
| **Saved (flash)** | Save 成功 | document 头闪过绿色 "Saved · Re-indexing" 2 秒后淡出 |
| **Indexing** | 文档刚上传或刚编辑 | document 头显示 "⏳ Indexing 12/47 chunks",progress 条 |
| **Indexed** | 索引完成 | 头显示 "✓ Indexed" 绿色 2 秒后淡出,行尾留 ✓ 持久 |
| **Indexing failed** | 解析或切片失败 | 头显示 "⚠ Indexing failed — [Retry] [Open as raw]" 红底 |
| **Uploading** | Dialog 内文件上传中 | 该行进度条,可单独取消 |
| **Upload failed (file)** | 单文件失败 | 该行红色 + [Retry];队列其他不受影响 |
| **Concurrent edit (conflict)** | 同时被另一 admin 改 | 顶部红 banner "Charlie edited 12s ago · [View diff] [Overwrite] [Discard mine]" |
| **Boundary saving** | Sheet Save & apply 中 | 按钮 spinner;Preview 段灰显;成功后右下浮 "Applied to 12 people" |
| **Permission denied** | member 试图打开不可见的 doc(理论上不会发生) | 整个 doc 区显示 "This document was moved or removed." 不暴露原因 |
| **Network offline** | 在编辑时网络断开 | 右下角 sticky toast "Offline · changes will sync when back online",编辑框继续可用,Save 灰显 |

---

## 5. 杀手锏功能 ⭐

### 5.1 跨 scope RAG 搜索 (⌘K)

不是字符串 LIKE 匹配,而是**语义检索**。
用户输入"客户异议",命中"objection / complaint / pushback"相关段落 — 即使原文档没出现"客户异议"四个字。结果按相关度排序,顶部显示总用时(`0.32s`),帮用户建立信任。
所有命中**自动按用户 boundary 裁剪** — member 只看到自己有权限的片段,看不到的文档**根本不出现在结果里**(不泄漏存在性)。
搜索框在 dashboard 任何位置 ⌘K 唤起,不必先进 `/knowledge` 页。

### 5.2 上传即结构化(产品方向)

用户拖一张组织架构图 .png 进 Personal scope → 系统识别图中"部门方块 + 连线" → 自动建议:`Engineering (lead: Alice K)` ├ `Platform (lead: Bob)` ├ `Growth` 等树结构 → 用户在 dialog 里勾选 "Apply suggestions" → 直接在 `/organization` 生成对应部门和员工。
PDF 同理:上传一份 .docx 的 "客户档案 - ACME",系统抽出公司名 / 联系人 / 行业 / 决策链 → 建议建立 ACME 客户 entry。
**这条 V1 范围内只跑"识别 + 建议"阶段,落地建立动作仍走 `/organization` 手工确认**——避免误识别 polluting 组织数据。本质是"高阶上传向导",而不是黑盒自动化。

### 5.3 实时索引进度可视化

每份新文档上传后,头部条目显示"⏳ Indexing 12/47 chunks"。
这件事重要因为:agent 在文档刚传上去**还没索引完**时去检索,会拿不到结果。让用户**亲眼看到**索引进度,他就知道"现在销售 agent 已经能用上新话术了"。
完成时绿色"✓ Indexed"闪 2 秒后淡出,保留 ✓ 标记。

### 5.4 Boundary 实时影响预览

编辑 boundary 时,**Preview 段**实时计算:"勾完这些,12 个人能看到 47 个 folder / 384 个 docs。" 展开能列出每个人 + 他的可见 folder 数。
admin 改规则前先看效果,避免"上线后才发现把 sales 的权限关错了"。
Save 之后立刻在 audit log 中写一条 `boundary.applied`,自带 diff(从 X 个文件夹变成 Y 个文件夹)。

### 5.5 文档侧"被谁看见"反向视图

打开任何一份文档,详情头永远有一行 "Visible via: Eng boundary + Q3 boundary"——告诉管理员"谁能看到这份文档"。
点这一行展开:列出每个 boundary 的 applied groups + 总计影响人数。
反过来还原"我建了一堆 boundary,某份文档到底被几人看到"的常见困惑。

---

## 6. 交互细节

- **拖拽**:
  - 文件拖入页面任何位置 → 上传 dialog 自动打开,文件自动入队
  - folder 拖到 folder 上 → 移动;拖到 root → 升级为顶级
  - 多选(Shift+click)folders 后整体拖动
- **键盘**:
  - `⌘K` 任意页面唤起 cross-scope 搜索
  - `↑/↓` 在 folder tree / 文档列表 / 搜索结果中导航
  - `↵` 打开,`⌘↵` 在新 tab 打开(用于对比)
  - 编辑模式下 `⌘S` 保存,`Esc` 取消
  - `/` 聚焦当前 folder 内文档搜索(不跨 scope,更精确)
- **内联重命名**:double-click folder 或 document 标题 → 文字变 editable → Enter 提交 / Esc 取消
- **复制分享链接**:文档详情按钮 [Copy share link] → 复制 `app.firefly-mesh.com/knowledge?doc=<id>`,粘到 Slack / inbox 给同事(对方点开自动按其 boundary 校验)
- **Tags as filter**:文档元信息里的 tag 是可点的 → 点 `q3` → 文档列表立即过滤为所有带 q3 tag 的
- **Indexing 进度浮窗**:批量上传时,左下角"进度浮窗"显示队列剩余 X 个文件 indexing,可一键 dismiss
- **Boundary 颜色编码**:每个 boundary 在 UI 上分配一种淡色(8 色循环),文档卡片 / folder tree 旁的"Visible via"小条用这些颜色,直观看到"哪个文档归哪个 boundary 管"
- **Markdown 编辑器**:支持 GFM(表格、checkbox、代码块),`Tab` 缩进 list,`⌘B/I` 加粗斜体,`⌘K` 在选中文字时插入链接

---

## 7. 边界与异常路径

- **跨 tenant 注入**:用户在 URL 改 `tenantId` 或 `folderId` 想拉别 tenant 的文档 → 后端直接 403,UI 显示 "This resource was not found or you don't have access."(同一条文案,不暴露 "存在但无权" vs "不存在")
- **Member 看不到的 folder 完全隐藏**:不是灰显,是 folder tree 中**根本不出现**——避免泄漏"组织内有一个叫 'Secret M&A' 的文件夹"这种元信息
- **Member 看不到 Boundaries / Sources 这两个 tab**:整个 tab 不渲染,不是禁用——避免 "我看到 tab 但点不开" 的困惑感
- **上传超限**:单文件 > 256 KB → 文件入队但红色 "File too large (max 256 KB)"+ [Open as plain text excerpt] 兜底(把前 100KB 切出来传,标记 truncated)
- **解析失败**(图片 OCR 失败、PDF 无法提取文本)→ 文档保留(用户的原意图不丢),只是 indexStatus=failed,agent 检索时不命中。用户可在文档头点 [Re-parse] 重试
- **并发编辑同一文档**:后保存者收到 "Charlie edited 12s ago · View diff" 提示。Diff view 用 word-level 高亮,提供 [Keep mine] / [Keep theirs] / [Merge manually] 三个选项
- **删除非空 folder**:第一次点 Delete 弹 confirm "This folder has 12 docs and 2 subfolders. They will all be deleted. Type the folder name to confirm." 防误删
- **删除文档**:Confirm Dialog,但不要求 type name(单 doc 风险较低)。删除后右下角浮 toast "Doc deleted · [Undo]"(10s 软删窗口)
- **网络断开 + 正在编辑**:右下 sticky "Offline · changes saved locally · will sync when reconnected"。编辑框继续可用;重连后自动 push;若服务端期间被其他人改 → 走 §4 concurrent-edit 分支
- **XSS / 恶意 markdown**:含 `<script>` / `onerror=` / `javascript:` 协议的 markdown,渲染时被 sanitize 静默剥离。不影响原始 content 存储(用户可以编辑改回)
- **Boundary 删除时引用方还在**:删除 boundary → confirm "This will revoke access for 12 people. Type 'REVOKE' to confirm." 双重保险
- **同时被两个 boundary 包含的 doc**:并集生效(给得多)。文档详情显示 "Visible via: Boundary A + Boundary B",透明化

---

## 8. 开放问题

- **PDF / 图片解析准确度**:V1 用基础 OCR + 文本提取,结构识别(组织图、表格)依赖大模型 — 失败率可能 10-30%。**决策**:V1 标榜"建议",不自动落地;失败时不阻断,只标 failed badge;落地动作仍走 `/organization` 手工。
- **boundary 优先级与冲突**:一个员工同时属于 Eng 和 Sales,allowed folders 取并集还是交集? **决策**:**并集**(broader 更安全的实操语义—— admin 容易看到"全集",误授权比误隔绝更可观察可修复)。文档详情显式列出"Visible via:" 帮 admin 自检。
- **Boundary 应用到 individual vs department**:V1 两者都支持,UI 上 department 优先(减少操作量,从权限管理学最佳实践);individual 是 advanced 折叠在底部。
- **Folder 嵌套深度**:V1 上限 5 层。再深的会失去管理直觉。
- **"已索引"语义模糊**:`indexStatus=ready` 只代表"切分完毕",不代表"agent 实际能查到" — 后者还要 agent 端 RAG 集成。**决策**:UI 文案统一用"Ready for retrieval"而非"Indexed",更诚实地表达"准备好,但要等 agent 来取"。
- **多语言文档**:中文 / 英文 / 日文 / ... 在同一 scope 下混存。搜索时应当按文档语言或按用户 i18n 偏好排序? **决策**:默认按相关度,不按语言。用户可在搜索 modal 加 `lang:zh` 过滤(V1 留位)。
- **Sources 连接器**(Notion / GitHub / Drive / Slack):V1 显示 Coming soon。先选哪 1-2 个落地? 待 design partner 反馈。
- **"agent 实际拉到了什么"的反向 audit 视图**:管理员能不能在 Audit 页看到 "上周 alice-agent 检索了 47 次,命中以下 docs" ? V1 范围内归到 Audit feature §5 杀手锏的延伸思考。
