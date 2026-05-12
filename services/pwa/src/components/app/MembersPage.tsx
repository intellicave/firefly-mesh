import { useState, useEffect } from "react"
import { UserPlus, Mail } from "lucide-react"
import { Button } from "../ui/button.tsx"
import { Input } from "../ui/input.tsx"
import { Label } from "../ui/label.tsx"
import { useT } from "../../i18n/store.ts"
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher.tsx"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Member = {
  userId: string
  role: "owner" | "admin" | "member"
  joinedAt: string
  name: string
  email: string
  image: string | null
}

function readTenantFromUrl(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("tenant")
}

export function MembersPage() {
  const t = useT()
  const tenant = readTenantFromUrl()
  const [members, setMembers] = useState<Member[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const tenantsRes = await fetch(`${HUB_URL}/api/tenants`, { credentials: "include" })
      if (!tenantsRes.ok) {
        setFetchError(t("members_error_load_teams"))
        setLoading(false)
        return
      }
      const tenantsBody = await tenantsRes.json() as {
        data: Array<{ id: string; slug: string }>
      }
      const found = tenantsBody.data.find((tnt) => tnt.slug === tenant)
      if (!found) {
        setFetchError(t("members_error_team_not_found"))
        setLoading(false)
        return
      }
      setTenantId(found.id)

      const membersRes = await fetch(`${HUB_URL}/api/tenants/${found.id}/members`, {
        credentials: "include",
      })
      if (!membersRes.ok) {
        setFetchError(t("members_error_load_members"))
        setLoading(false)
        return
      }
      const membersBody = await membersRes.json() as { data: Member[] }
      setMembers(membersBody.data)
      setLoading(false)
    }
    load()
  }, [tenant])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setInviteLoading(true)
    setInviteError(null)

    const res = await fetch(`${HUB_URL}/api/tenants/${tenantId}/invite`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    const body = await res.json() as { data?: unknown; error?: { message: string } }

    if (!res.ok) {
      setInviteError(body.error?.message ?? t("members_error_invite_failed"))
      setInviteLoading(false)
      return
    }

    setInviteSuccess(true)
    setInviteEmail("")
    setInviteLoading(false)
    setTimeout(() => { setInviteSuccess(false); setShowInvite(false) }, 2000)
  }

  const roleBadgeClass = (role: string) => {
    if (role === "owner") return "bg-primary/10 text-primary"
    if (role === "admin") return "bg-blue-50 text-blue-700"
    return "bg-muted text-muted-foreground"
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("members_loading")}</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">{fetchError}</p>
      </div>
    )
  }

  const roleLabel = (role: string): string => {
    if (role === "owner") return t("members_role_owner")
    if (role === "admin") return t("members_role_admin")
    return t("members_role_member")
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("members_title")}</h1>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Button
            size="sm"
            onClick={() => { setShowInvite(!showInvite); setInviteError(null); setInviteSuccess(false) }}
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.75} />
            {t("members_invite_button")}
          </Button>
        </div>
      </div>

      {showInvite && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <h2 className="text-sm font-medium">{t("members_invite_card_title")}</h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inviteEmail">{t("members_invite_email_label")}</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder={t("members_invite_email_placeholder")}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                disabled={inviteLoading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inviteRole">{t("members_invite_role_label")}</Label>
              <select
                id="inviteRole"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                disabled={inviteLoading}
              >
                <option value="member">{t("members_role_member")}</option>
                <option value="admin">{t("members_role_admin")}</option>
              </select>
            </div>

            {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            {inviteSuccess && (
              <p className="text-sm text-green-600">{t("members_invite_sent")}</p>
            )}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={inviteLoading}>
                <Mail className="h-4 w-4" strokeWidth={1.75} />
                {inviteLoading ? t("members_inviting") : t("members_invite_submit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowInvite(false)}
                disabled={inviteLoading}
              >
                {t("members_invite_cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {members.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("members_empty")}
          </div>
        ) : (
          members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                {m.image ? (
                  <img
                    src={m.image}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
                    {m.name.slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(m.role)}`}
              >
                {roleLabel(m.role)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
