import { z } from "zod";
import { organize, hasGroqKey } from "@/lib/organize";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Raw pastes can be long scraped threads; give Groq room to see all of it.
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().min(1, "Paste some text first.").max(200_000, "That paste is too large."),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const result = await organize(parsed.data.text);

    // Keep the raw paste so a weak parse can be re-run later.
    try {
      await query(
        `INSERT INTO ingests (raw_text, engine, model, job_count)
         VALUES ($1, $2, $3, $4)`,
        [parsed.data.text.slice(0, 100_000), result.engine, result.model, result.jobs.length]
      );
    } catch (err) {
      // Ingest history is best-effort — never fail the request over it.
      console.error("[POST /api/organize] could not record ingest:", err);
    }

    return Response.json({
      jobs: result.jobs,
      engine: result.engine,
      model: result.model,
      groqConfigured: hasGroqKey(),
      usage: result.usage ?? null,
    });
  } catch (err) {
    console.error("[POST /api/organize]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not organize that text." },
      { status: 500 }
    );
  }
}
