import { useEffect, useState } from "react"
import { Users, UserPlus } from "lucide-react"
import { Button } from "../ui/button.tsx"
import { Input } from "../ui/input.tsx"
import { Label } from "../ui/label.tsx"
import { cn } from "../../lib/cn.ts"
import { useT } from "../../i18n/store.ts"
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher.tsx"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Mode = "create" | "join" | null

export function OnboardingForm() {
  const t = useT()
  const [mode, setMode] = useState<Mode>(null)
  const [teamName, setTeamName] = useState("")
  const [teamSlug, setTeamSlug] = useState("")
  const [inviteToken, setInviteToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // If the user already belongs to a tenant (e.g. logging in again via OAuth),
  // skip onboarding and go straight to their inbox. Only show the create/join
  // UI for genuinely new accounts.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const res = await fetch(`${HUB_URL}/api/tenants`, { credentials: "include" })
      if (cancelled) return
      if (res.ok) {
        const body = (await res.json()) as { data: Array<{ slug: string }> }
        if (body.data.length > 0) {
          window.location.replace(
            `/app/inbox?tenant=${encodeURIComponent(body.data[0]!.slug)}`,
          )
          return
        }
      }
      setChecking(false)
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  function handleTeamNameChange(value: string) {
    setTeamName(value)
    setTeamSlug(
      value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 32),
    )
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch(`${HUB_URL}/api/tenants`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: teamSlug, displayName: teamName }),
    })
    const body = await res.json() as { data?: { slug: string }; error?: { code: string; message: string } }

    if (!res.ok || !body.data) {
      const code = body.error?.code
      setError(
        code === "SLUG_TAKEN"
          ? t("onboarding_error_slug_taken")
          : (body.error?.message ?? t("onboarding_error_create_failed")),
      )
      setLoading(false)
      return
    }

    window.location.href = `/app/inbox?tenant=${encodeURIComponent(body.data.slug)}`
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const token = inviteToken.trim().split("/").pop() ?? inviteToken.trim()

    const res = await fetch(`${HUB_URL}/api/invite/${token}/accept`, {
      method: "POST",
      credentials: "include",
    })
    const body = await res.json() as { data?: { tenantSlug: string }; error?: { code: string; message: string } }

    if (!res.ok || !body.data) {
      const code = body.error?.code
      const msg =
        code === "INVITATION_EXPIRED"
          ? t("onboarding_error_invite_expired")
          : code === "INVITATION_USED"
            ? t("onboarding_error_invite_used")
            : (body.error?.message ?? t("onboarding_error_invite_invalid"))
      setError(msg)
      setLoading(false)
      return
    }

    window.location.href = `/app/inbox?tenant=${encodeURIComponent(body.data.tenantSlug)}`
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("onboarding_loading")}</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{t("onboarding_title")}</h1>
          <p className="text-sm text-muted-foreground">{t("onboarding_subtitle")}</p>
        </div>

        {mode === null && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("create")}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-accent",
              )}
            >
              <Users className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t("onboarding_create_team")}</span>
            </button>

            <button
              onClick={() => setMode("join")}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-accent",
              )}
            >
              <UserPlus className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t("onboarding_join_team")}</span>
            </button>
          </div>
        )}

        {mode === "create" && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">{t("onboarding_team_name_label")}</Label>
              <Input
                id="teamName"
                type="text"
                placeholder={t("onboarding_team_name_placeholder")}
                value={teamName}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                required
                minLength={1}
                maxLength={50}
                disabled={loading}
              />
              {teamSlug && (
                <p className="text-xs text-muted-foreground">
                  {t("onboarding_url_preview_prefix")}
                  {teamSlug}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading || !teamSlug}>
              {loading ? t("onboarding_creating") : t("onboarding_create_submit")}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode(null); setError(null) }}
              disabled={loading}
            >
              {t("cta_back")}
            </Button>
          </form>
        )}

        {mode === "join" && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteLink">{t("onboarding_invite_label")}</Label>
              <Input
                id="inviteLink"
                type="text"
                placeholder={t("onboarding_invite_placeholder")}
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading || !inviteToken.trim()}>
              {loading ? t("onboarding_joining") : t("onboarding_join_submit")}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode(null); setError(null) }}
              disabled={loading}
            >
              {t("cta_back")}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
