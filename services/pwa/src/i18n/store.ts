/**
 * Global i18n store, shared across all React islands on the page.
 *
 * Astro hydrates each `client:load` component as an independent React tree —
 * a normal React Context can't reach across islands. So we use a tiny
 * singleton with useSyncExternalStore: every island subscribes to the same
 * `currentLang` value and re-renders together when it changes.
 *
 * Persistence: localStorage[`firefly-mesh.lang`] is the source of truth for
 * "this user's explicit choice". If absent, we auto-detect from
 * navigator.language on first read (Chinese-family locales → 'zh', else 'en').
 */

import { useSyncExternalStore } from "react"
import type { Lang, Messages } from "./messages.ts"
import { en } from "./en.ts"
import { zh } from "./zh.ts"

const STORAGE_KEY = "firefly-mesh.lang"
const DICTS: Record<Lang, Messages> = { en, zh }

/** Detect from browser language. Treat zh / zh-CN / zh-TW / zh-HK all as zh. */
function detectFromNavigator(): Lang {
  if (typeof navigator === "undefined") return "en"
  const lang = (navigator.language || "en").toLowerCase()
  return lang.startsWith("zh") ? "zh" : "en"
}

/** Read the explicit choice from localStorage, otherwise auto-detect. */
function initialLang(): Lang {
  if (typeof localStorage === "undefined") return "en"
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "en" || stored === "zh") return stored
  return detectFromNavigator()
}

let currentLang: Lang = initialLang()
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

/** Imperative setter — used by the language switcher. Persists to localStorage. */
export function setLang(lang: Lang): void {
  if (lang === currentLang) return
  currentLang = lang
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* SSR / private mode / quota — ignore */
    }
  }
  notify()
  // Update <html lang> so screen readers + CSS :lang() work.
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const getSnapshot = () => currentLang
const getServerSnapshot = () => "en" as const

/** Returns the current language. Re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Returns a typed translation function for the current language.
 *
 * Usage: const t = useT(); <h1>{t("landing_h1_line1")}</h1>
 */
export function useT(): (key: keyof Messages) => string {
  const lang = useLang()
  return (key: keyof Messages) => DICTS[lang][key]
}
