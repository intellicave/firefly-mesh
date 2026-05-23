"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

// W11: minimal client component. NEXT_LOCALE cookie picks the next-intl locale
// on the next SSR cycle (i18n/request.ts reads it). router.refresh() triggers
// re-render after the cookie write so the user sees the switch immediately.

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const toggle = () => {
    const next = locale === "zh" ? "en" : "zh";
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={locale === "zh" ? "Switch to English" : "切换为中文"}
    >
      {locale === "zh" ? "EN" : "中"}
    </Button>
  );
}
