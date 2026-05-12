import { useT } from "../../i18n/store.ts"
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher.tsx"

export function LandingPage() {
  const t = useT()

  return (
    <>
      {/* Top nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span
              className="inline-block h-6 w-6 rounded-md"
              style={{
                background: "linear-gradient(135deg, hsl(258 90% 66%), hsl(280 90% 60%))",
              }}
            />
            <span>{t("brand_name")}</span>
          </a>
          <nav className="flex items-center gap-2 text-sm">
            <LanguageSwitcher />
            <a
              href="/login"
              className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
            >
              {t("cta_sign_in")}
            </a>
            <a
              href="/signup"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("cta_get_started")}
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-5xl px-6">
        <section className="grid items-center gap-12 py-20 md:grid-cols-2 md:py-28">
          <div className="space-y-6">
            <p className="text-sm font-medium uppercase tracking-wider text-primary">
              {t("landing_eyebrow")}
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              {t("landing_h1_line1")}
              <br />
              {t("landing_h1_line2")}
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              {t("landing_subtitle_before_emphasis")}
              <span className="text-foreground font-medium">{t("landing_subtitle_emphasis")}</span>
            </p>
            <div>
              <a
                href="/signup"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("cta_get_started")}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">{t("landing_no_credit_card")}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 text-xs">
              <div className="flex-1 space-y-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted font-bold">
                  A
                </div>
                <p className="font-medium">{t("landing_diagram_alice_label")}</p>
                <p className="text-muted-foreground">{t("landing_diagram_alice_org")}</p>
              </div>

              <div className="flex flex-1 flex-col items-center gap-1">
                <div className="h-px w-full bg-border" />
                <p className="text-xs text-muted-foreground">{t("landing_diagram_e2e")}</p>
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-xs font-medium">
                  hub
                </div>
                <p className="text-xs text-muted-foreground">{t("landing_diagram_push")}</p>
                <div className="h-px w-full bg-border" />
              </div>

              <div className="flex-1 space-y-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted font-bold">
                  B
                </div>
                <p className="font-medium">{t("landing_diagram_bob_label")}</p>
                <p className="text-muted-foreground">{t("landing_diagram_bob_org")}</p>
              </div>
            </div>
            <div className="mt-6 rounded-md bg-muted/50 px-3 py-2 text-center text-xs">
              <span className="font-medium text-foreground">{t("landing_diagram_gate_you")}</span>
              <span className="text-muted-foreground">{t("landing_diagram_gate_rest")}</span>
            </div>
          </div>
        </section>

        <section className="grid gap-8 border-t border-border py-16 md:grid-cols-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t("landing_q1_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("landing_q1_body")}</p>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t("landing_q2_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("landing_q2_body")}</p>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t("landing_q3_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("landing_q3_body")}</p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card px-6 py-10 md:px-10">
          <h2 className="text-2xl font-bold tracking-tight">{t("landing_byo_title")}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("landing_byo_intro")}</p>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-border p-4">
              <p className="font-medium">{t("landing_runtime_claude_code_name")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("landing_runtime_claude_code_hint")}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="font-medium">{t("landing_runtime_mcp_name")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("landing_runtime_mcp_hint")}</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="font-medium">{t("landing_runtime_http_name")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("landing_runtime_http_hint")}</p>
            </div>
          </div>
        </section>

        <div className="py-8" />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer_copyright")}</p>
          <nav className="flex gap-4">
            <a
              href="https://github.com/intellicave/firefly-mesh"
              className="hover:text-foreground"
            >
              GitHub
            </a>
            <a href="/login" className="hover:text-foreground">
              {t("cta_sign_in")}
            </a>
            <a href="/signup" className="hover:text-foreground">
              {t("cta_sign_up")}
            </a>
          </nav>
        </div>
      </footer>
    </>
  )
}
