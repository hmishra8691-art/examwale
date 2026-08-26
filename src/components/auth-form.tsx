"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "@/components/ui";

type FieldError = { path: string; message: string };

export function AuthForm({
  mode,
  next,
  googleEnabled,
  initialError,
}: {
  mode: "login" | "signup";
  next: string;
  googleEnabled: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const fieldError = (path: string) => fieldErrors.find((issue) => issue.path === path)?.message;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setFieldErrors([]);

    try {
      const response = await fetch(`/api/v1/auth/${mode === "login" ? "login" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email, password } : { email, password, name: name || undefined },
        ),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        setFieldErrors(body?.error?.fields ?? []);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {googleEnabled ? (
        <>
          <a
            href={`/api/v1/auth/google?next=${encodeURIComponent(next)}`}
            className="flex w-full items-center justify-center gap-3 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-raised)]"
          >
            <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
              <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.5h4.8a4.1 4.1 0 01-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
              <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 009 18z" />
              <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 010-3.4V5H.9a9 9 0 000 8l3-2.3z" />
              <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 00.9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
            </svg>
            Continue with Google
          </a>
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-faint">or</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" ? (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Your name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 outline-none focus:border-brand-500"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldError("email"))}
            aria-describedby={fieldError("email") ? "email-error" : undefined}
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 outline-none focus:border-brand-500"
          />
          {fieldError("email") ? (
            <p id="email-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {fieldError("email")}
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="text-xs text-muted hover:text-[var(--text)]"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldError("password"))}
            aria-describedby={fieldError("password") ? "password-error" : mode === "signup" ? "password-hint" : undefined}
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 outline-none focus:border-brand-500"
          />
          {mode === "signup" && !fieldError("password") ? (
            <p id="password-hint" className="mt-1 text-xs text-faint">
              At least 10 characters. Length matters more than symbols.
            </p>
          ) : null}
          {fieldError("password") ? (
            <p id="password-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {fieldError("password")}
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/25 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <Button type="submit" full size="lg" disabled={busy}>
          {busy ? "Just a moment…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </Card>
  );
}
