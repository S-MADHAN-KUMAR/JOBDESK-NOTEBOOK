"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Same-origin path to return to after signing in. */
  next: string;
};

export function LoginForm({ next }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        setBusy(false);
        return;
      }

      // The cookie is httpOnly — push so the board renders with the new session.
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col justify-center px-4 py-10 sm:px-6 sm:py-20">
      <div className="accent-band rounded-3xl border border-rule px-5 py-7 shadow-card sm:px-8 sm:py-9">
        <p className="meta">Jobdesk Notebook</p>
        <h1 className="mt-3 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          Sign in.
        </h1>
        <p className="mt-2 text-sm text-muted">Your leads are one paste away.</p>

        <form
          onSubmit={submit}
          className="mt-6 border-t border-rule-strong pt-6"
          aria-describedby={error ? "login-error" : undefined}
        >
          <label className="block">
            <span className="meta">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className="mt-2 h-10 w-full rounded-lg border border-rule-strong bg-raised px-3 text-sm text-ink shadow-card placeholder:text-faint focus-ring"
              placeholder="admin"
            />
          </label>

          <label className="mt-5 block">
            <span className="meta">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-2 h-10 w-full rounded-lg border border-rule-strong bg-raised px-3 text-sm text-ink shadow-card placeholder:text-faint focus-ring"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p
              id="login-error"
              role="alert"
              className="mt-5 rounded-lg border border-red-200 bg-tint-blush px-3 py-2 text-sm text-tint-blush-ink"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="mt-6 h-10 w-full rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
