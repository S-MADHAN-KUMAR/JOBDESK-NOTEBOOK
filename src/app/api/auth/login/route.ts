import { z } from "zod";
import { startSession } from "@/lib/auth";
import { credentialsMatch } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

/** Constant cost per failed attempt, so response time does not leak a partial match. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const expectedUser = process.env.AUTH_USERNAME?.trim();
  const expectedPass = process.env.AUTH_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return Response.json(
      { error: "Sign-in is not configured. Set AUTH_USERNAME and AUTH_PASSWORD in .env." },
      { status: 503 }
    );
  }

  const ok = await credentialsMatch(
    parsed.data.username.trim(),
    parsed.data.password,
    expectedUser,
    expectedPass
  );

  if (!ok) {
    await sleep(400);
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }

  // Sign as the *configured* username, never the typed one.
  await startSession(expectedUser);
  return Response.json({ ok: true });
}
