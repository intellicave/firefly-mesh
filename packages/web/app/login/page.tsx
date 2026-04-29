"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Sign in to firefly-mesh
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                required
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium"
                htmlFor="password"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                required
                autoComplete="current-password"
                minLength={12}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
              ) : null}
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
