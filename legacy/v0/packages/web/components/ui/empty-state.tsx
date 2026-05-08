"use client";

// Shared empty state — used by inbox, audit, knowledge, skills, organization.
// Per ui.md state-completeness contract: every empty state needs icon + title +
// description + (optional) primary CTA. Single source of visual truth.

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CTAProps {
  label: string;
  /** Either onClick (button) or href (link) — exactly one. */
  onClick?: () => void;
  href?: string;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
}

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description?: string;
  /** Primary call-to-action. */
  cta?: CTAProps;
  /** Secondary action (e.g. "Clear filters"). */
  secondary?: CTAProps;
  /** Override default `py-16 px-6` padding. */
  className?: string;
  /** Children render between description and CTAs (rare). */
  children?: ReactNode;
}

export function EmptyState({
  Icon,
  title,
  description,
  cta,
  secondary,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      <Icon size={20} strokeWidth={1.5} className="text-primary" />
      <h2 className="font-serif text-base text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
      {cta || secondary ? (
        <div className="mt-2 flex items-center gap-2">
          {cta ? <CTAButton {...cta} variant="primary" /> : null}
          {secondary ? <CTAButton {...secondary} variant="secondary" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function CTAButton({
  label,
  onClick,
  href,
  icon: Icon,
  loading,
  disabled,
  variant,
}: CTAProps & { variant: "primary" | "secondary" }) {
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border bg-card text-foreground hover:bg-secondary",
  );

  const content = (
    <>
      {loading ? (
        <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
      ) : Icon ? (
        <Icon size={12} strokeWidth={1.75} />
      ) : null}
      {label}
    </>
  );

  if (href) {
    return (
      <a href={href} className={className} aria-disabled={disabled}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
    >
      {content}
    </button>
  );
}
