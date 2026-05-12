/**
 * All translatable strings, typed.
 *
 * Adding a new key:
 *   1. Add it to the Messages type below.
 *   2. Add the English string to en.ts.
 *   3. Add the Chinese string to zh.ts (failing this is a typecheck error).
 *
 * The type-driven design means missing translations are caught at build time —
 * no silent string fallbacks, no `t("missing.key")` rendering as garbage in
 * production. If you see a TypeScript error in en.ts / zh.ts, that's a missing
 * key — go fix it.
 */

export type Lang = "en" | "zh"

export interface Messages {
  // -- Brand / generic --
  brand_name: string
  cta_get_started: string
  cta_sign_in: string
  cta_sign_up: string
  cta_continue: string
  cta_back: string

  // -- Landing page --
  landing_eyebrow: string
  landing_h1_line1: string
  landing_h1_line2: string
  landing_subtitle_before_emphasis: string
  landing_subtitle_emphasis: string
  landing_no_credit_card: string
  landing_diagram_alice_label: string
  landing_diagram_alice_org: string
  landing_diagram_bob_label: string
  landing_diagram_bob_org: string
  landing_diagram_e2e: string
  landing_diagram_push: string
  landing_diagram_gate_you: string
  landing_diagram_gate_rest: string
  landing_q1_title: string
  landing_q1_body: string
  landing_q2_title: string
  landing_q2_body: string
  landing_q3_title: string
  landing_q3_body: string
  landing_byo_title: string
  landing_byo_intro: string
  landing_runtime_claude_code_name: string
  landing_runtime_claude_code_hint: string
  landing_runtime_mcp_name: string
  landing_runtime_mcp_hint: string
  landing_runtime_http_name: string
  landing_runtime_http_hint: string
  footer_copyright: string

  // -- Signup form --
  signup_title: string
  signup_have_account: string
  signup_continue_google: string
  signup_continue_github: string
  signup_or: string
  signup_label_name: string
  signup_placeholder_name: string
  signup_label_email: string
  signup_placeholder_email: string
  signup_label_password: string
  signup_placeholder_password: string
  signup_submit: string
  signup_submitting: string
  signup_error_generic: string

  // -- Login form --
  login_title: string
  login_no_account: string
  login_continue_google: string
  login_continue_github: string
  login_or: string
  login_label_email: string
  login_placeholder_email: string
  login_label_password: string
  login_submit: string
  login_submitting: string
  login_error_credentials: string

  // -- Language switcher --
  lang_switch_label: string
}
