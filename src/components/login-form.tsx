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
    <div className="mx-auto flex w-full max-w-[560px] flex-col justify-center px-6 py-16 sm:py-24">
      <p className="meta">Jobdesk Notebook</p>
      <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
        Sign in.
      </h1>

      <form
        onSubmit={submit}
        className="mt-8 border-t border-rule-strong pt-8"
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
            className="mt-2 h-10 w-full rounded-md border border-rule-strong bg-raised px-3 text-sm text-ink placeholder:text-faint focus-ring"
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
            className="mt-2 h-10 w-full rounded-md border border-rule-strong bg-raised px-3 text-sm text-ink placeholder:text-faint focus-ring"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p
            id="login-error"
            role="alert"
            className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="mt-6 h-10 w-full rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
