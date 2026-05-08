"use client";

// App shell — TopBar + Sidebar + main area.
// Used by (dashboard) routes after user signs in.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  Clapperboard,
  History,
  Inbox as InboxIcon,
  Network,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/command-palette";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface MeResponse {
  user: { id: string };
  employee: {
    id: string;
    name: string;
    title: string | null;
    email: string;
    role: string;
    avatarUrl: string | null;
  };
  org: { id: string; name: string; slug: string };
  pendingCounts: { inboxApprove: number; inboxAction: number };
}

const NAV_ITEMS = [
  // Order per ui.md §1: Inbox + Audit (HITL hot path), then org-management,
  // then knowledge / skills (back-of-house), then settings.
  { href: "/inbox", label: "Inbox", Icon: InboxIcon, badge: "inbox" },
  { href: "/audit", label: "Audit", Icon: History },
  { href: "/organization", label: "Organization", Icon: Network },
  { href: "/scene", label: "Scene", Icon: Clapperboard },
  { href: "/knowledge", label: "Knowledge", Icon: BookOpen },
  { href: "/skills", label: "Skills", Icon: Sparkles },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
  });

  // ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const me = meQuery.data;
  const inboxTotal =
    (me?.pendingCounts.inboxApprove ?? 0) + (me?.pendingCounts.inboxAction ?? 0);

  const initials = me?.employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="grid h-full min-h-screen grid-cols-[15rem_1fr] grid-rows-[3.5rem_1fr]">
      {/* TopBar */}
      <header
        className="col-span-2 flex h-14 items-center gap-4 border-b bg-card px-4"
        style={{ gridArea: "1 / 1 / 2 / 3" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-serif text-lg leading-tight tracking-tight text-primary">
            firefly-mesh
          </span>
          {me ? (
            <span className="text-sm text-muted-foreground">
              · {me.org.name}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            aria-label="Open command palette"
          >
            <Search size={14} strokeWidth={1.75} />
            <span>Search or jump to…</span>
            <span className="ml-auto hidden rounded bg-muted px-1.5 py-0.5 text-[10px] sm:inline">
              ⌘K
            </span>
          </button>
        </div>

        <ThemeToggle />

        <button
          type="button"
          className="relative flex size-8 items-center justify-center rounded-md hover:bg-secondary"
          aria-label="Notifications"
        >
          <Bell size={16} strokeWidth={1.75} />
          {inboxTotal > 0 ? (
            <span className="pulse-orange absolute right-1 top-1 size-2 rounded-full bg-primary" />
          ) : null}
        </button>

        {me ? (
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-secondary"
          >
            <Avatar className="size-7">
              {me.employee.avatarUrl ? (
                <AvatarImage src={me.employee.avatarUrl} alt={me.employee.name} />
              ) : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <div className="size-7 animate-pulse rounded-full bg-muted" />
        )}
      </header>

      {/* Sidebar */}
      <aside className="col-start-1 row-start-2 flex flex-col border-r bg-card">
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const showBadge =
              "badge" in item && item.badge === "inbox" && inboxTotal > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-1.5 h-6 w-[3px] rounded-r bg-primary" />
                ) : null}
                <item.Icon size={14} strokeWidth={1.75} />
                <span>{item.label}</span>
                {showBadge ? (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {inboxTotal}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {me ? (
          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                {me.employee.avatarUrl ? (
                  <AvatarImage src={me.employee.avatarUrl} alt={me.employee.name} />
                ) : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {me.employee.name}
                </div>
                <div className="truncate text-xs text-muted-foreground capitalize">
                  {me.employee.role}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Main */}
      <main className="col-start-2 row-start-2 overflow-y-auto">
        {children}
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
