// Sprint B B.5 (Option B): marketing landing replaces the sprint A client-side
// auth gate at `/`. Logged-out visitors land on a server-rendered marketing
// page (good SEO, fast first paint, no JS required). Logged-in visitors get
// the marketing JSX briefly then a client-side redirect to /inbox or
// /onboarding via <SessionRedirect /> below.

import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";

import { SessionRedirect } from "./_marketing/session-redirect";

export default async function RootPage() {
  const t = await getTranslations("marketing");

  return (
    <>
      {/* Client-side: redirect logged-in users away. Renders nothing for anonymous. */}
      <SessionRedirect />

      {/* Top nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <span
              className="inline-block h-6 w-6 rounded-md"
              style={{
                background:
                  "linear-gradient(135deg, hsl(258 90% 66%), hsl(280 90% 60%))",
              }}
              aria-hidden
            />
            <span>Firefly Mesh</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
            >
              {t("cta.signIn")}
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("cta.getStarted")}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-5xl px-6">
        <section className="grid items-center gap-12 py-20 md:grid-cols-2 md:py-28">
          <div className="space-y-6">
            <p className="text-sm font-medium uppercase tracking-wider text-primary">
              {t("hero.eyebrow")}
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              {t("hero.h1Line1")}
              <br />
              {t("hero.h1Line2")}
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              {t("hero.subtitleBefore")}
              <span className="text-foreground font-medium">
                {t("hero.subtitleEmphasis")}
              </span>
            </p>
            <div>
              <Link
                href="/signup"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("cta.getStarted")}
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("hero.noCreditCard")}
            </p>
          </div>

          {/* Cross-org flow diagram */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 text-xs">
              <div className="flex-1 space-y-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted font-bold">
                  A
                </div>
                <p className="font-medium">{t("diagram.aliceLabel")}</p>
                <p className="text-muted-foreground">{t("diagram.aliceOrg")}</p>
              </div>
              <div className="flex flex-1 flex-col items-center gap-1">
                <div className="h-px w-full bg-border" />
                <p className="text-xs text-muted-foreground">
                  {t("diagram.e2e")}
                </p>
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-xs font-medium">
                  hub
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("diagram.push")}
                </p>
                <div className="h-px w-full bg-border" />
              </div>
              <div className="flex-1 space-y-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted font-bold">
                  B
                </div>
                <p className="font-medium">{t("diagram.bobLabel")}</p>
                <p className="text-muted-foreground">{t("diagram.bobOrg")}</p>
              </div>
            </div>
            <div className="mt-6 rounded-md bg-muted/50 px-3 py-2 text-center text-xs">
              <span className="font-medium text-foreground">
                {t("diagram.gateYou")}
              </span>
              <span className="text-muted-foreground">
                {t("diagram.gateRest")}
              </span>
            </div>
          </div>
        </section>

        {/* 3-question Q&A */}
        <section className="grid gap-8 border-t border-border py-16 md:grid-cols-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t("qa.q1Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("qa.q1Body")}</p>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t("qa.q2Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("qa.q2Body")}</p>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t("qa.q3Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("qa.q3Body")}</p>
          </div>
        </section>

        {/* Bring-your-own agent */}
        <section className="rounded-xl border border-border bg-card px-6 py-10 md:px-10">
          <h2 className="text-2xl font-bold tracking-tight">
            {t("byo.title")}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {t("byo.intro")}
          </p>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-border p-4">
              <p className="font-medium">{t("byo.claudeCodeName")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("byo.claudeCodeHint")}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="font-medium">{t("byo.mcpName")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("byo.mcpHint")}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="font-medium">{t("byo.httpName")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("byo.httpHint")}
              </p>
            </div>
          </div>
        </section>

        <div className="py-8" />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.copyright")}</p>
          <nav className="flex gap-4">
            <a
              href="https://github.com/intellicave/firefly-mesh"
              className="hover:text-foreground"
            >
              GitHub
            </a>
            <Link href="/login" className="hover:text-foreground">
              {t("cta.signIn")}
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              {t("cta.signUp")}
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
