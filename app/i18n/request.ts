import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

// W11: next-intl v4 getRequestConfig — without-i18n-routing mode (no middleware,
// no /zh/* path prefix). Locale persisted via NEXT_LOCALE cookie set by
// components/language-switcher.tsx; SSR reads it here on each request.
//
// Falls back to "en" when the cookie is missing or invalid so older sessions
// never see a runtime error.

const SUPPORTED = ["en", "zh"] as const;
type SupportedLocale = (typeof SUPPORTED)[number];

function isSupported(value: string | undefined): value is SupportedLocale {
  return value !== undefined && (SUPPORTED as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale = isSupported(raw) ? raw : "en";
  const mod = await import(`@/lib/messages/${locale}`);
  return { locale, messages: mod.messages };
});
