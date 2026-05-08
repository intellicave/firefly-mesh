import type { ReactNode } from "react";

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="font-serif text-2xl text-primary">firefly-mesh</span>
          <span className="text-sm text-muted-foreground">· setup</span>
        </header>
        {children}
      </div>
    </div>
  );
}
