import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "@/lib/session";

/** The signed-in user for this request, or null. */
export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Page guard for server components. Redirects to /login, carrying the current
 * path so sign-in returns the user to where they were headed.
 */
export async function requireSession(pathname: string): Promise<void> {
  if (await getSession()) return;
  const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  redirect(`/login${next}`);
}

/** Issue the session cookie. Called from the login route handler. */
export async function startSession(username: string): Promise<Date> {
  const { token, expires } = await createSessionToken(username);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return expires;
}

/** Clear the session cookie. Called from the logout route handler. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Route-handler guard. Returns null when the caller is signed in, otherwise a
 * 401 response — so APIs stay protected even if the proxy is bypassed:
 *
 *   const denied = await apiGuard();
 *   if (denied) return denied;
 */
export async function apiGuard(): Promise<Response | null> {
  if (await getSession()) return null;
  return Response.json({ error: "Sign in required." }, { status: 401 });
}
