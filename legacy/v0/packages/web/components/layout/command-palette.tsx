"use client";

// ⌘K command palette — global navigation + actions.
// Built on cmdk + the existing Dialog primitive (radix-ui).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import {
  BookOpen,
  History,
  Inbox,
  LogOut,
  Monitor,
  Moon,
  Network,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";

interface NavItem {
  label: string;
  href: string;
  Icon: typeof Inbox;
  group: "navigate";
}

const NAV: NavItem[] = [
  { label: "Inbox", href: "/inbox", Icon: Inbox, group: "navigate" },
  { label: "Audit", href: "/audit", Icon: History, group: "navigate" },
  {
    label: "Organization",
    href: "/organization",
    Icon: Network,
    group: "navigate",
  },
  { label: "Knowledge", href: "/knowledge", Icon: BookOpen, group: "navigate" },
  { label: "Skills", href: "/skills", Icon: Sparkles, group: "navigate" },
  { label: "Settings", href: "/settings", Icon: Settings, group: "navigate" },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { setTheme } = useTheme();

  // Reset query when closed
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Close dialog first, then run the side-effect on the next tick so the
  // Dialog unmount completes cleanly before route / theme / signOut work.
  const go = (href: string) => {
    onOpenChange(false);
    setTimeout(() => router.push(href), 0);
  };

  const signOut = () => {
    onOpenChange(false);
    setTimeout(async () => {
      try {
        await authClient.signOut();
      } finally {
        router.replace("/login");
      }
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <Command
          label="Command palette"
          className="[&_[cmdk-input]]:h-11"
          shouldFilter
        >
          <div className="border-b px-3">
            <Command.Input
              placeholder="Type a command or search…"
              value={query}
              onValueChange={setQuery}
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
              No results.
            </Command.Empty>

            <Command.Group
              heading="Navigate"
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {NAV.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`navigate ${item.label} ${item.href}`}
                  onSelect={() => go(item.href)}
                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
                >
                  <item.Icon
                    size={14}
                    strokeWidth={1.75}
                    className="text-muted-foreground"
                  />
                  <span className="text-foreground">{item.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {item.href}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group
              heading="Theme"
              className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {[
                { value: "theme light", label: "Light", Icon: Sun, set: "light" as const },
                { value: "theme dark", label: "Dark", Icon: Moon, set: "dark" as const },
                {
                  value: "theme system",
                  label: "System",
                  Icon: Monitor,
                  set: "system" as const,
                },
              ].map((t) => (
                <Command.Item
                  key={t.set}
                  value={t.value}
                  onSelect={() => {
                    // Close dialog first, then setTheme on next tick.
                    // Without the defer, root <html> className flips while
                    // the radix Dialog is still mid-unmount, causing React
                    // to call removeChild on a node Tailwind's dark variant
                    // already swapped out, throwing
                    // `Failed to execute 'removeChild': not a child`.
                    onOpenChange(false);
                    setTimeout(() => setTheme(t.set), 0);
                  }}
                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
                >
                  <t.Icon
                    size={14}
                    strokeWidth={1.75}
                    className="text-muted-foreground"
                  />
                  <span>{t.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group
              heading="Account"
              className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              <Command.Item
                value="account sign out logout"
                onSelect={signOut}
                className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive aria-selected:bg-destructive/10"
              >
                <LogOut size={14} strokeWidth={1.75} />
                <span>Sign out</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
