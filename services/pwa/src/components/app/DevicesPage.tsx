import { useEffect, useState } from "react"
import { Smartphone, Loader, Trash2 } from "lucide-react"
import { Button } from "../ui/button.tsx"
import { useT } from "../../i18n/store.ts"
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher.tsx"

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string

type Agent = {
  id: string
  displayName: string
  type: string
  createdAt: string
  lastSeenAt: string | null
}

export function DevicesPage() {
  const t = useT()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await fetch(`${HUB_URL}/api/me/agents`, { credentials: "include" })
      if (cancelled) return
      if (!res.ok) {
        setError(res.status === 401 ? t("inbox_please_sign_in") : t("devices_error_load"))
        setLoading(false)
        return
      }
      const body = (await res.json()) as { data: Agent[] }
      setAgents(body.data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRevoke(agentId: string) {
    if (!confirm(t("devices_revoke_confirm"))) {
      return
    }
    setRevoking(agentId)
    const res = await fetch(`${HUB_URL}/api/agents/${agentId}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) {
      setAgents((prev) => prev.filter((a) => a.id !== agentId))
    } else {
      setError(t("devices_error_revoke_failed"))
    }
    setRevoking(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" strokeWidth={1.75} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{t("devices_title")}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {agents.length}{" "}
            {agents.length === 1 ? t("devices_count_singular") : t("devices_count_plural")}
          </span>
          <LanguageSwitcher />
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col gap-5 rounded-lg border border-border p-6">
          <div className="flex items-start gap-3">
            <Smartphone className="h-8 w-8 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium">{t("devices_empty_title")}</p>
              <p className="text-xs text-muted-foreground">{t("devices_empty_intro")}</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <RuntimeCard
              label={t("devices_runtime_claude_code_label")}
              hint={t("devices_runtime_claude_code_hint")}
              command="openclaw skill install firefly-mesh"
              copyLabel={t("devices_copy")}
              copiedLabel={t("devices_copied")}
            />
            <RuntimeCard
              label={t("devices_runtime_mcp_label")}
              hint={t("devices_runtime_mcp_hint")}
              command={`"firefly-mesh": { "command": "npx", "args": ["-y", "@firefly-mesh/mcp"] }`}
              copyLabel={t("devices_copy")}
              copiedLabel={t("devices_copied")}
            />
            <RuntimeCard
              label={t("devices_runtime_http_label")}
              hint={t("devices_runtime_http_hint")}
              command="curl -X POST https://hub.firefly-mesh.com/api/agents/pair-init"
              copyLabel={t("devices_copy")}
              copiedLabel={t("devices_copied")}
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("devices_runtime_footer")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-medium">{a.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type} ·{" "}
                    {a.lastSeenAt
                      ? `${t("devices_last_seen")} ${new Date(a.lastSeenAt).toLocaleString()}`
                      : t("devices_never_connected")}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRevoke(a.id)}
                disabled={revoking === a.id}
              >
                <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RuntimeCard({
  label,
  hint,
  command,
  copyLabel,
  copiedLabel,
}: {
  label: string
  hint: string
  command: string
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // older browsers / non-https — ignore silently
    }
  }
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="block flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  )
}
