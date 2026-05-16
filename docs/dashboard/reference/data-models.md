# Reference — 数据模型 (D1 schema)

> 所有表 schema 的单一来源。功能文档里出现的"详见 reference/data-models.md §X" 指向本文。

---

## 1. Migration 顺序

| # | 文件 | 内容 | 状态 |
|---|---|---|---|
| 0001 | `0001_init.sql` | Better Auth 表 + tenants + members + agents + prekey_bundles + pair_codes | ✅ 已应用 |
| 0002 | `0002_messages_invitations.sql` | messages + invitations + a2a_seen | ✅ |
| 0003 | `0003_push.sql` | push_subscriptions | ✅ |
| 0004 | `0004_cron_locks.sql` + audit_log + triggers | cron_locks + audit_log + 自动写 triggers | ✅ (P0-4 GAN 已加固) |
| 0005 | `0005_onboarding_state.sql` | onboarding_state | ⚠️ 待写 (feature 08) |
| 0006 | `0006_org_entities.sql` | employees + departments + projects + project_members + tasks | ⚠️ (feature 03) |
| 0007 | `0007_knowledge.sql` | folders + documents + boundaries | ⚠️ (feature 04) |
| 0008 | `0008_skills.sql` | skills + tools + router_rules + skill_runs + tenant_secrets | ⚠️ (feature 05) |

---

## 2. 现有表 (0001–0004)

### §auth (Better Auth)

详见 [feature 07](../features/07-account-and-auth.md) §4。

```sql
-- user / account / session / verification
-- 由 Better Auth 自动管理,schema 见 better-auth 文档
```

### §tenants + §members + §invitations

详见 [feature 03](../features/03-organization.md) §4。

```sql
CREATE TABLE tenants (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE members (
  user_id      TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX idx_members_tenant ON members(tenant_id);

CREATE TABLE invitations (
  token            TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL,
  invited_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  used_at          TEXT,
  used_by_user_id  TEXT
);
CREATE INDEX idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX idx_invitations_email ON invitations(email);
```

### §agents + §prekey_bundles + §pair_codes

详见 [feature 02](../features/02-agent-onboarding.md) §4。

```sql
CREATE TABLE agents (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  tenant_id      TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  type           TEXT NOT NULL,
  public_key_ed  BLOB NOT NULL,
  jwt_kid        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT,
  revoked_at     TEXT
);
CREATE INDEX idx_agents_user ON agents(user_id);
CREATE INDEX idx_agents_tenant ON agents(tenant_id);

CREATE TABLE prekey_bundles (
  agent_id    TEXT PRIMARY KEY,
  ik_pub      BLOB NOT NULL,
  spk_pub     BLOB NOT NULL,
  spk_sig     BLOB NOT NULL,
  opks        TEXT NOT NULL,    -- JSON array
  updated_at  TEXT NOT NULL
);

CREATE TABLE pair_codes (
  code             TEXT PRIMARY KEY,
  user_id          TEXT,
  bound_user_id    TEXT,
  bound_tenant_id  TEXT,
  agent_id         TEXT,
  status           TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
```

### §messages

详见 [feature 01](../features/01-agent-messaging.md) §4。

```sql
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  from_tenant_id  TEXT,
  from_agent_id   TEXT NOT NULL,
  to_agent_id     TEXT NOT NULL,
  subject         TEXT,
  body_ciphertext TEXT NOT NULL,
  body_preview    TEXT,
  status          TEXT NOT NULL,    -- pending/approved/rejected/read/delivered
  signature       TEXT,
  created_at      TEXT NOT NULL,
  approved_at     TEXT,
  approved_by     TEXT
);
CREATE INDEX idx_messages_tenant_status ON messages(tenant_id, status, created_at DESC);
CREATE INDEX idx_messages_to_agent ON messages(to_agent_id, created_at DESC);

CREATE TABLE a2a_seen (
  signature_hash TEXT PRIMARY KEY,
  seen_at        TEXT NOT NULL
);
-- cron 清理 24h 前的 a2a_seen 行
```

### §push

```sql
CREATE TABLE push_subscriptions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  keys         TEXT NOT NULL,    -- JSON { p256dh, auth }
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
```

### §audit

详见 [feature 06](../features/06-audit-log.md) §4。

```sql
CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT,
  actor_kind    TEXT NOT NULL,
  actor_id      TEXT,
  actor_label   TEXT NOT NULL,
  kind          TEXT NOT NULL,
  subject_kind  TEXT,
  subject_id    TEXT,
  details       TEXT NOT NULL,    -- JSON,上限 8KB
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_audit_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_kind_created   ON audit_log(kind, created_at DESC);
CREATE INDEX idx_audit_actor          ON audit_log(actor_id);

-- triggers 自动从 messages / members / agents 等表写 audit_log
-- 详见 services/hub/migrations/0004_*.sql

CREATE TABLE cron_locks (
  name          TEXT PRIMARY KEY,
  acquired_at   TEXT NOT NULL
);
```

---

## 3. 待新增表

### §onboarding (0005)

```sql
CREATE TABLE onboarding_state (
  user_id           TEXT NOT NULL,
  tenant_id         TEXT NOT NULL,
  created_org       INTEGER NOT NULL DEFAULT 0,
  imported          INTEGER NOT NULL DEFAULT 0,
  skipped_import    INTEGER NOT NULL DEFAULT 0,
  paired_agent      INTEGER NOT NULL DEFAULT 0,
  skipped_pair      INTEGER NOT NULL DEFAULT 0,
  completed         INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
);
```

### §org (0006)

```sql
CREATE TABLE employees (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  user_id         TEXT,          -- 已绑平台用户则 FK,否则 NULL
  name            TEXT NOT NULL,
  email           TEXT,
  role_in_tenant  TEXT,          -- 自由文本,e.g. Engineer / PM
  department_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'active',  -- active/invited/suspended
  joined_at       TEXT NOT NULL
);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_user   ON employees(user_id);
CREATE INDEX idx_employees_dept   ON employees(department_id);

CREATE TABLE departments (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  name              TEXT NOT NULL,
  lead_employee_id  TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_departments_tenant ON departments(tenant_id);

CREATE TABLE projects (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  owner_employee_id   TEXT,
  due_date            TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);

CREATE TABLE project_members (
  project_id    TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  PRIMARY KEY (project_id, employee_id)
);

CREATE TABLE tasks (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  title                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'todo',   -- todo/in_progress/done/blocked
  assignee_employee_id  TEXT,
  due_date              TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
```

### §knowledge (0007)

```sql
CREATE TABLE folders (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  parent_id   TEXT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_folders_tenant_parent ON folders(tenant_id, parent_id);

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  folder_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  content_md    TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',
  size_bytes    INTEGER NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_tenant ON documents(tenant_id);

CREATE TABLE boundaries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  allowed_folders TEXT NOT NULL DEFAULT '[]',  -- JSON array of folder ids
  applied_groups  TEXT NOT NULL DEFAULT '[]',  -- JSON array of { kind, id }
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_boundaries_tenant ON boundaries(tenant_id);
```

### §skills (0008)

```sql
CREATE TABLE skills (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  system_prompt     TEXT NOT NULL,
  tool_ids          TEXT NOT NULL DEFAULT '[]',
  boundary_ids      TEXT NOT NULL DEFAULT '[]',
  triggers          TEXT NOT NULL DEFAULT '[]',
  model_preference  TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  last_used_at      TEXT
);
CREATE INDEX idx_skills_tenant ON skills(tenant_id);

CREATE TABLE tools (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  display_name    TEXT,
  type            TEXT NOT NULL,    -- http/mcp/native
  endpoint        TEXT,
  auth_config     TEXT NOT NULL DEFAULT '{}',  -- JSON with secret_ref
  schema          TEXT NOT NULL DEFAULT '{}',  -- JSON Schema
  status          TEXT NOT NULL DEFAULT 'active',
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_tools_tenant ON tools(tenant_id);

CREATE TABLE router_rules (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 0,
  pattern       TEXT NOT NULL,    -- 'kw:foo' or 'rx:\\bfoo\\b'
  model         TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_router_tenant_priority ON router_rules(tenant_id, priority);

CREATE TABLE skill_runs (
  id                  TEXT PRIMARY KEY,
  skill_id            TEXT NOT NULL,
  tenant_id           TEXT NOT NULL,
  trigger_message_id  TEXT,
  status              TEXT NOT NULL,
  duration_ms         INTEGER,
  error_message       TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX idx_skill_runs_skill ON skill_runs(skill_id);
CREATE INDEX idx_skill_runs_tenant ON skill_runs(tenant_id, created_at DESC);

-- tool secret 加密存储 (AES-256-GCM,key 从 env SECRETS_KEY)
CREATE TABLE tenant_secrets (
  ref          TEXT PRIMARY KEY,    -- e.g. 'tenant_abc/tool_xyz/token'
  tenant_id    TEXT NOT NULL,
  ciphertext   BLOB NOT NULL,
  iv           BLOB NOT NULL,
  tag          BLOB NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

---

## 4. 索引策略

- **每个 tenant_id 列必有 index**(通常组合 `(tenant_id, created_at DESC)`)
- 高频查询带过滤的:再加二级 column 进 index
- `messages` 加 `(to_agent_id, created_at DESC)` 用于 agent 端拉自己的消息
- `audit_log` 三个独立 index (tenant / kind / actor),日志查询模式多变

---

## 5. 数据生命周期

| 表 | 保留期 | 清理机制 |
|---|---|---|
| `a2a_seen` | 24h | cron 每 1h 清 |
| `audit_log` | 90 天 | cron 每天 03:00 清 (P0-4 GAN 已加固) |
| `pair_codes` | 状态 expired/completed 超过 1h | cron 每 1h 清 |
| `skill_runs` | 30 天 | V2 加 cron;V1 表为空 |
| 其他 | 不自动删除 | 用户操作 |

---

## 6. 跨表约束

D1 不支持 FK 强制,在应用层 / triggers 维护:

- 删 tenant → 级联删 members, invitations, agents, employees, departments, projects, tasks, folders, documents, boundaries, skills, tools, router_rules, messages, audit_log(tenant_id), onboarding_state, push_subscriptions
- 删 user → 级联清 session, account, push_subscriptions, members(行删除), employees.user_id=NULL & status='suspended'
- 删 agent → DELETE prekey_bundles + WHERE messages.to_agent_id 不影响(历史保留)
- 删 department → 不级联,employees.department_id 置 NULL
- 删 project → 级联删 project_members + tasks
- 删 folder → 默认 reject 如有 children;`force=1` 时递归删

---

## 7. 数据迁移脚本

D1 trigger 限制:`wrangler d1 migrations apply` 会按 `;` 分割语句,会破坏 BEGIN/END 触发器体。

**解决方案**(已就位): `scripts/install-audit-triggers.mjs` 用 `--file` API 一次性发送整个 SQL 文件。

新增 migration 0005-0008 时,若不包含 trigger 则用标准 `wrangler d1 migrations apply` 即可;若包含则参照 0004 用脚本。
