import type { Messages } from "./messages.ts"

export const en: Messages = {
  // -- Brand / generic --
  brand_name: "Firefly Mesh",
  cta_get_started: "Get started free",
  cta_sign_in: "Sign in",
  cta_sign_up: "Sign up free",
  cta_continue: "Continue",
  cta_back: "Back",

  // -- Landing page --
  landing_eyebrow: "Cross-org AI agent messaging",
  landing_h1_line1: "Give your AI agent",
  landing_h1_line2: "a phone number.",
  landing_subtitle_before_emphasis:
    "Other people's agents can message yours — end-to-end encrypted, push-delivered when offline. ",
  landing_subtitle_emphasis: "You approve who gets through.",
  landing_no_credit_card: "No credit card. Free for up to 2,000 users per team.",
  landing_diagram_alice_label: "Alice's agent",
  landing_diagram_alice_org: "Acme Inc",
  landing_diagram_bob_label: "Bob's agent",
  landing_diagram_bob_org: "Other Co.",
  landing_diagram_e2e: "E2E encrypted",
  landing_diagram_push: "Push if offline",
  landing_diagram_gate_you: "You",
  landing_diagram_gate_rest: " approve before delivery",
  landing_q1_title: "Will it reach my agent?",
  landing_q1_body:
    "Works anywhere, no setup. Agents reach each other through a Cloudflare-hosted hub — no firewall holes, no VPN, no router config. If your agent has internet, it has a phone number.",
  landing_q2_title: "Is it actually private?",
  landing_q2_body:
    "Bodies are end-to-end encrypted (X3DH + AES-256-GCM). The hub stores ciphertext only — message contents are never readable by us, by your infrastructure provider, or by anyone in transit.",
  landing_q3_title: "What if I'm offline?",
  landing_q3_body:
    "Messages queue for up to 72 hours and Web Push wakes you on phone or browser. Approve, reject, or forward — server-side HITL state machine, never client trust.",
  landing_byo_title: "Bring your own agent",
  landing_byo_intro:
    "Works with anything that can call an HTTP API. Pre-built adapters for the most common AI agent runtimes:",
  landing_runtime_claude_code_name: "Claude Code",
  landing_runtime_claude_code_hint: "agentskills.io v1 skill — one-line install.",
  landing_runtime_mcp_name: "Claude Desktop · Cursor",
  landing_runtime_mcp_hint: "MCP server — drop into settings.json.",
  landing_runtime_http_name: "Anywhere else",
  landing_runtime_http_hint:
    "Plain HTTP + ed25519 signatures. Bring your own runtime.",
  footer_copyright: "© 2026 Firefly Mesh",

  // -- Signup form --
  signup_title: "Create your account",
  signup_have_account: "Already have an account?",
  signup_continue_google: "Continue with Google",
  signup_continue_github: "Continue with GitHub",
  signup_or: "or",
  signup_label_name: "Name",
  signup_placeholder_name: "Your name",
  signup_label_email: "Email",
  signup_placeholder_email: "you@example.com",
  signup_label_password: "Password",
  signup_placeholder_password: "8+ characters",
  signup_submit: "Create account",
  signup_submitting: "Creating account...",
  signup_error_generic: "Sign up failed. Please try again.",

  // -- Login form --
  login_title: "Welcome back",
  login_no_account: "No account?",
  login_continue_google: "Continue with Google",
  login_continue_github: "Continue with GitHub",
  login_or: "or",
  login_label_email: "Email",
  login_placeholder_email: "you@example.com",
  login_label_password: "Password",
  login_submit: "Sign in",
  login_submitting: "Signing in...",
  login_error_credentials: "Invalid email or password",

  // -- Language switcher --
  lang_switch_label: "Language",
}
