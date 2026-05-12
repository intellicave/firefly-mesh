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

  // -- Onboarding --
  onboarding_loading: "Loading…",
  onboarding_title: "Get started",
  onboarding_subtitle: "Create a new team or join an existing one",
  onboarding_create_team: "Create a team",
  onboarding_join_team: "Join a team",
  onboarding_team_name_label: "Team name",
  onboarding_team_name_placeholder: "Acme Inc",
  onboarding_url_preview_prefix: "URL: firefly-mesh.com/app/",
  onboarding_create_submit: "Continue",
  onboarding_creating: "Creating…",
  onboarding_invite_label: "Invite link or token",
  onboarding_invite_placeholder: "Paste invite link here",
  onboarding_join_submit: "Join team",
  onboarding_joining: "Joining…",
  onboarding_error_slug_taken: "Name taken, try another",
  onboarding_error_invite_expired: "This invitation has expired",
  onboarding_error_invite_used: "This invitation has already been used",
  onboarding_error_invite_invalid: "Invalid invitation",
  onboarding_error_create_failed: "Failed to create team",

  // -- Connect / device pairing --
  connect_loading: "Loading…",
  connect_expired_title: "Code expired",
  connect_expired_body:
    "Run the install command again from your terminal to get a new code.",
  connect_error_title: "Something went wrong",
  connect_error_load_status: "Failed to load pairing status",
  connect_error_load_teams: "Failed to load teams",
  connect_error_network: "Network error",
  connect_error_bind_failed: "Failed to bind device",
  connect_success_title: "Device connected",
  connect_success_body: "You can close this tab and return to your terminal.",
  connect_bind_title: "Bind your agent",
  connect_code_expires_in: "Expires in",
  connect_team_label: "Team",
  connect_bind_button: "Bind device",
  connect_binding: "Binding…",
  connect_missing_code: "Missing pairing code in URL",

  // -- Inbox --
  inbox_loading: "Loading…",
  inbox_error_load_teams: "Failed to load teams",
  inbox_error_load_messages: "Failed to load messages",
  inbox_error_team_not_found: "Team not found",
  inbox_please_sign_in: "Please sign in",
  inbox_title: "Inbox",
  inbox_status_live: "Live",
  inbox_status_connecting: "Connecting…",
  inbox_status_offline: "Offline",
  inbox_count_singular: "message",
  inbox_count_plural: "messages",
  inbox_empty_title: "Your inbox is empty",
  inbox_empty_body: "Connect an agent to start receiving messages",
  inbox_empty_manage_devices: "Manage devices",
  inbox_no_summary: "(no summary)",

  // -- Devices --
  devices_loading: "Loading devices…",
  devices_error_load: "Failed to load devices",
  devices_error_revoke_failed: "Failed to revoke device",
  devices_revoke_confirm:
    "Revoke this device? It will no longer be able to send or receive messages.",
  devices_title: "Your devices",
  devices_count_singular: "agent",
  devices_count_plural: "agents",
  devices_empty_title: "No agents connected",
  devices_empty_intro:
    "Install the Firefly skill on any AI agent runtime to start sending and receiving messages.",
  devices_runtime_claude_code_label: "OpenClaw / Claude Code",
  devices_runtime_claude_code_hint:
    "Skill-based runtimes (agentskills.io v1). Recommended for most users.",
  devices_runtime_mcp_label: "Claude Desktop / Cursor",
  devices_runtime_mcp_hint: "MCP-compatible clients. Add this to your settings.json:",
  devices_runtime_http_label: "Anywhere else (HTTP)",
  devices_runtime_http_hint: "Any runtime that can call HTTP APIs. Pair via:",
  devices_runtime_footer:
    "All three modes use the same /connect?code=… pairing flow — no token pasting.",
  devices_copy: "Copy",
  devices_copied: "Copied",
  devices_last_seen: "last seen",
  devices_never_connected: "never connected",

  // -- Language switcher --
  lang_switch_label: "Language",
}
