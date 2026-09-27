"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Lives in the header, so it needs its own client boundary. */
export function SignOutButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  // Nothing to sign out of on the sign-in screen.
  if (pathname === "/login") return null;

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="h-8 shrink-0 rounded-lg border border-rule-strong bg-raised px-3 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40 focus-ring"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
