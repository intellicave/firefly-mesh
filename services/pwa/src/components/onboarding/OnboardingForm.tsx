import { useState } from "react"
import { Users, UserPlus } from "lucide-react"
import { Button } from "../ui/button.tsx"
import { Input } from "../ui/input.tsx"
import { Label } from "../ui/label.tsx"
import { cn } from "../../lib/cn.ts"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Mode = "create" | "join" | null

export function OnboardingForm() {
  const [mode, setMode] = useState<Mode>(null)
  const [teamName, setTeamName] = useState("")
  const [teamSlug, setTeamSlug] = useState("")
  const [inviteToken, setInviteToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(code === "SLUG_TAKEN" ? "Name taken, try another" : (body.error?.message ?? "Failed to create team"))
      setLoading(false)
      return
    }

    window.location.href = `/app/${body.data.slug}/inbox`
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
          ? "This invitation has expired"
          : code === "INVITATION_USED"
            ? "This invitation has already been used"
            : (body.error?.message ?? "Invalid invitation")
      setError(msg)
      setLoading(false)
      return
    }

    window.location.href = `/app/${body.data.tenantSlug}/inbox`
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Get started</h1>
          <p className="text-sm text-muted-foreground">Create a new team or join an existing one</p>
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
              <span className="text-sm font-medium">Create a team</span>
            </button>

            <button
              onClick={() => setMode("join")}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-accent",
              )}
            >
              <UserPlus className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">Join a team</span>
            </button>
          </div>
        )}

        {mode === "create" && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team name</Label>
              <Input
                id="teamName"
                type="text"
                placeholder="Acme Inc"
                value={teamName}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                required
                minLength={1}
                maxLength={50}
                disabled={loading}
              />
              {teamSlug && (
                <p className="text-xs text-muted-foreground">
                  URL: firefly-mesh.com/app/{teamSlug}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading || !teamSlug}>
              {loading ? "Creating..." : "Continue"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode(null); setError(null) }}
              disabled={loading}
            >
              Back
            </Button>
          </form>
        )}

        {mode === "join" && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteLink">Invite link or token</Label>
              <Input
                id="inviteLink"
                type="text"
                placeholder="Paste invite link here"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading || !inviteToken.trim()}>
              {loading ? "Joining..." : "Join team"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode(null); setError(null) }}
              disabled={loading}
            >
              Back
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
