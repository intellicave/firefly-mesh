import { useLang, setLang } from "./store.ts"
import type { Lang } from "./messages.ts"

/**
 * Compact EN / 中 toggle. Two-pill design so the user sees both options and
 * which is active at a glance — important for first-time visitors landing in
 * the wrong language who need to find this fast.
 */
export function LanguageSwitcher() {
  const lang = useLang()
  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-md border border-border text-xs"
      role="group"
      aria-label="Language selector"
    >
      <Btn current={lang} value="en" label="EN" />
      <Btn current={lang} value="zh" label="中" />
    </div>
  )
}

function Btn({ current, value, label }: { current: Lang; value: Lang; label: string }) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={active}
      className={
        "px-2 py-1 transition-colors " +
        (active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-accent hover:text-foreground")
      }
    >
      {label}
    </button>
  )
}
