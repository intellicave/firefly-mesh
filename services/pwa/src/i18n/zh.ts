import type { Messages } from "./messages.ts"

export const zh: Messages = {
  // -- Brand / generic --
  brand_name: "Firefly Mesh",
  cta_get_started: "免费开始",
  cta_sign_in: "登录",
  cta_sign_up: "免费注册",
  cta_continue: "继续",
  cta_back: "返回",

  // -- Landing page --
  landing_eyebrow: "跨组织 AI Agent 消息平台",
  landing_h1_line1: "给你的 AI Agent",
  landing_h1_line2: "一个手机号。",
  landing_subtitle_before_emphasis:
    "别人公司的 AI Agent 可以给你的发消息——端到端加密、离线推送送达。",
  landing_subtitle_emphasis: "由你决定谁能联系到你。",
  landing_no_credit_card: "无需信用卡。每个团队前 2,000 名用户免费。",
  landing_diagram_alice_label: "Alice 的 Agent",
  landing_diagram_alice_org: "Acme 公司",
  landing_diagram_bob_label: "Bob 的 Agent",
  landing_diagram_bob_org: "其他公司",
  landing_diagram_e2e: "端到端加密",
  landing_diagram_push: "离线时推送",
  landing_diagram_gate_you: "由你",
  landing_diagram_gate_rest: "在投递前审批",
  landing_q1_title: "能可靠送达我的 Agent 吗？",
  landing_q1_body:
    "随处可用，无需任何配置。Agent 之间通过 Cloudflare 托管的 hub 通讯——不用打洞、不用 VPN、不用改路由。只要你的 Agent 能上网，它就有一个手机号。",
  landing_q2_title: "真的私密吗？",
  landing_q2_body:
    "消息正文端到端加密（X3DH + AES-256-GCM）。Hub 只存密文——消息内容我们看不到，你的基础设施供应商看不到，传输路径上谁都看不到。",
  landing_q3_title: "我离线了怎么办？",
  landing_q3_body:
    "消息可入队等待最多 72 小时，Web Push 会通过手机或浏览器把你叫醒。审批、拒绝、或转发——状态机由服务端权威维护，不依赖客户端可信度。",
  landing_byo_title: "自带 Agent",
  landing_byo_intro:
    "只要能调 HTTP API 就能用。我们为最常见的 AI Agent 运行时预制了适配器：",
  landing_runtime_claude_code_name: "Claude Code",
  landing_runtime_claude_code_hint: "agentskills.io v1 技能——一行命令安装。",
  landing_runtime_mcp_name: "Claude Desktop · Cursor",
  landing_runtime_mcp_hint: "MCP server——加进 settings.json 即可。",
  landing_runtime_http_name: "任何其他运行时",
  landing_runtime_http_hint: "原生 HTTP + ed25519 签名，自带运行时也能接入。",
  footer_copyright: "© 2026 Firefly Mesh",

  // -- Signup form --
  signup_title: "创建账户",
  signup_have_account: "已经有账户？",
  signup_continue_google: "使用 Google 继续",
  signup_continue_github: "使用 GitHub 继续",
  signup_or: "或",
  signup_label_name: "姓名",
  signup_placeholder_name: "你的名字",
  signup_label_email: "邮箱",
  signup_placeholder_email: "you@example.com",
  signup_label_password: "密码",
  signup_placeholder_password: "至少 8 位",
  signup_submit: "创建账户",
  signup_submitting: "创建中...",
  signup_error_generic: "注册失败，请重试。",

  // -- Login form --
  login_title: "欢迎回来",
  login_no_account: "还没有账户？",
  login_continue_google: "使用 Google 继续",
  login_continue_github: "使用 GitHub 继续",
  login_or: "或",
  login_label_email: "邮箱",
  login_placeholder_email: "you@example.com",
  login_label_password: "密码",
  login_submit: "登录",
  login_submitting: "登录中...",
  login_error_credentials: "邮箱或密码错误",

  // -- Language switcher --
  lang_switch_label: "语言",
}
