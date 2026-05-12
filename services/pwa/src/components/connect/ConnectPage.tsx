import { useEffect, useState } from "react"
import { CircleCheck, CircleAlert, Loader } from "lucide-react"
import { Button } from "../ui/button.tsx"
import { useT } from "../../i18n/store.ts"
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher.tsx"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Tenant = { id: string; slug: string; displayName: string; role: string }

type PairStatus = {
  code: string
  deviceName: string
  claimed: boolean
  tenantId: string | null
  expiresAt: string
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "expired" }
  | { kind: "ready"; status: PairStatus; tenants: Tenant[] }
  | { kind: "binding" }
  | { kind: "success" }

type Props = { code: string }

export function ConnectPage({ code }: Props) {
  const t = useT()
  const [state, setState] = useState<State>(
    code ? { kind: "loading" } : { kind: "error", message: t("connect_missing_code") },
  )
  const [selectedTenantId, setSelectedTenantId] = useState<string>("")
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0)

  useEffect(() => {
    if (!code) return  // empty code handled in initial state
    let cancelled = false

    async function load() {
      try {
        const [statusRes, tenantsRes] = await Promise.all([
          fetch(`${HUB_URL}/api/agents/pair-status?code=${encodeURIComponent(code)}`, {
            credentials: "include",
          }),
          fetch(`${HUB_URL}/api/tenants`, { credentials: "include" }),
        ])

        if (cancelled) return

        if (statusRes.status === 404) {
          setState({ kind: "expired" })
          return
        }
        if (!statusRes.ok) {
          setState({ kind: "error", message: t("connect_error_load_status") })
          return
        }
        if (!tenantsRes.ok) {
          if (tenantsRes.status === 401) {
            window.location.href = `/login?redirect=/connect?code=${encodeURIComponent(code)}`
            return
          }
          setState({ kind: "error", message: t("connect_error_load_teams") })
          return
        }

        const statusBody = (await statusRes.json()) as { data: PairStatus }
        const tenantsBody = (await tenantsRes.json()) as { data: Tenant[] }

        if (statusBody.data.claimed) {
          setState({ kind: "success" })
          return
        }

        setState({ kind: "ready", status: statusBody.data, tenants: tenantsBody.data })
        if (tenantsBody.data.length > 0) {
          setSelectedTenantId(tenantsBody.data[0]!.id)
        }
      } catch {
        if (!cancelled) setState({ kind: "error", message: t("connect_error_network") })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    if (state.kind !== "ready") return
    const expiresMs = new Date(state.status.expiresAt).getTime()
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
      setRemainingSeconds(remaining)
      if (remaining === 0) setState({ kind: "expired" })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state])

  async function handleBind() {
    if (state.kind !== "ready" || !selectedTenantId) return
    setState({ kind: "binding" })

    const res = await fetch(`${HUB_URL}/api/agents/pair-confirm`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, tenantId: selectedTenantId }),
    })

    if (!res.ok) {
      const body = (await res.json()) as { error?: { message: string } }
      setState({ kind: "error", message: body.error?.message ?? t("connect_error_bind_failed") })
      return
    }

    setState({ kind: "success" })
  }

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" strokeWidth={1.75} />
      </div>
    )
  }

  if (state.kind === "expired") {
    return (
      <CenteredCard>
        <CircleAlert className="h-10 w-10 text-destructive" strokeWidth={1.5} />
        <h1 className="text-lg font-semibold">{t("connect_expired_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("connect_expired_body")}</p>
      </CenteredCard>
    )
  }

  if (state.kind === "error") {
    return (
      <CenteredCard>
        <CircleAlert className="h-10 w-10 text-destructive" strokeWidth={1.5} />
        <h1 className="text-lg font-semibold">{t("connect_error_title")}</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </CenteredCard>
    )
  }

  if (state.kind === "success") {
    return (
      <CenteredCard>
        <CircleCheck className="h-10 w-10 text-green-600" strokeWidth={1.5} />
        <h1 className="text-lg font-semibold">{t("connect_success_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("connect_success_body")}</p>
      </CenteredCard>
    )
  }

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = (remainingSeconds % 60).toString().padStart(2, "0")
  const isBinding = state.kind === "binding"

  return (
    <CenteredCard>
      <h1 className="text-xl font-semibold">{t("connect_bind_title")}</h1>
      <p className="text-sm text-muted-foreground">
        {state.kind === "ready" && state.status.deviceName}
      </p>

      <div className="my-4 rounded-lg bg-muted px-6 py-4 font-mono text-2xl font-bold tracking-wider">
        {code}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("connect_code_expires_in")}{" "}
        <span className="font-mono">{minutes}:{seconds}</span>
      </p>

      {state.kind === "ready" && state.tenants.length > 1 && (
        <div className="mt-4 w-full text-left">
          <label htmlFor="tenant" className="mb-1.5 block text-sm font-medium">
            {t("connect_team_label")}
          </label>
          <select
            id="tenant"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
          >
            {state.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button onClick={handleBind} disabled={isBinding || !selectedTenantId} className="mt-4 w-full">
        {isBinding ? (
          <>
            <Loader className="h-4 w-4 animate-spin" strokeWidth={1.75} /> {t("connect_binding")}
          </>
        ) : (
          t("connect_bind_button")
        )}
      </Button>
    </CenteredCard>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-lg border border-border p-8 text-center">
        {children}
      </div>
    </div>
  )
}
