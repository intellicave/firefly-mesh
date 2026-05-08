"use client";

// Theme toggle button — cycles light → dark → system.
// Uses next-themes; renders nothing until mounted to avoid hydration mismatch.

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Reserve space, no icon (avoid SSR hydration flash)
    return <span className={cn("size-8 inline-block", className)} aria-hidden />;
  }

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const Icon =
    theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  const label =
    theme === "system" ? "System theme" : resolvedTheme === "dark" ? "Dark" : "Light";

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${label} — click to cycle`}
      aria-label={`Toggle theme (current: ${label})`}
      className={cn(
        "flex size-8 items-center justify-center rounded-md hover:bg-secondary",
        className,
      )}
    >
      <Icon size={14} strokeWidth={1.75} />
    </button>
  );
}
