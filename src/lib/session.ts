/**
 * Stateless session tokens — signed with HMAC-SHA256 via Web Crypto so the
 * same code runs in the Node runtime (server components, route handlers) and
 * the Edge runtime (`src/proxy.ts`).
 *
 * No third-party auth library: the token is
 *   base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))
 * and the signature is verified in constant time.
 */

export const SESSION_COOKIE = "jobdesk_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Payload = {
  /** Expiry, Unix seconds. */
  exp: number;
  /** Username that signed in — lets a credential change invalidate sessions. */
  sub: string;
};

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value) return value;
  throw new Error(
    "SESSION_SECRET is missing. Add it to .env (openssl rand -base64 32) — see .env.example."
  );
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(body: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  return b64url(mac);
}

/** Build a signed session token for `username`, valid for SESSION_TTL_MS. */
export async function createSessionToken(username: string): Promise<{ token: string; expires: Date }> {
  const payload: Payload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL_MS / 1000, sub: username };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return { token: `${body}.${await sign(body)}`, expires: new Date(Date.now() + SESSION_TTL_MS) };
}

/**
 * Verify signature + expiry. Returns the payload, or null for anything
 * malformed, tampered with or expired. Never throws.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<Payload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  try {
    const macBytes = fromB64url(mac);
    // Constant-time comparison — Web Crypto's verify does not short-circuit.
    const ok = await crypto.subtle.verify("HMAC", await key(), macBytes, new TextEncoder().encode(body));
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    if (typeof payload?.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (typeof payload?.sub !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Timing-safe credential check. Uses HMAC digests of the provided values so
 * neither the comparison nor its length leaks where the values differ.
 */
export async function credentialsMatch(
  username: string,
  password: string,
  expectedUser: string,
  expectedPass: string
): Promise<boolean> {
  const enc = new TextEncoder();
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));

  const [a, b, c, d] = await Promise.all([
    digest(username),
    digest(password),
    digest(expectedUser),
    digest(expectedPass),
  ]);

  // Both digests are 32 bytes; XOR-accumulate so the loop never exits early.
  const eq = (x: Uint8Array, y: Uint8Array) => {
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
  };

  // Run both comparisons even if the first fails (no early exit).
  const userOk = eq(a, c);
  const passOk = eq(b, d);
  return userOk && passOk;
}
