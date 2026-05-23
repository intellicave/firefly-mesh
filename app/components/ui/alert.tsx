import * as React from "react";

import { cn } from "@/lib/utils";

// Minimal Alert component — used by sprint A AE1 disable banners.
// Mirrors shadcn/ui's API surface so a later swap to the canonical component
// is a drop-in replacement (no consumer changes).

type AlertVariant = "default" | "destructive" | "warning";

const variantClass: Record<AlertVariant, string> = {
  default: "border bg-card text-card-foreground",
  destructive:
    "border-destructive/50 bg-destructive/10 text-destructive [&>svg]:text-destructive",
  warning:
    "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100 [&>svg]:text-amber-600",
};

interface AlertProps extends React.ComponentProps<"div"> {
  variant?: AlertVariant;
}

export function Alert({
  className,
  variant = "default",
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "relative w-full rounded-lg border px-4 py-3 text-sm",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"h5">) {
  return (
    <h5
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}
