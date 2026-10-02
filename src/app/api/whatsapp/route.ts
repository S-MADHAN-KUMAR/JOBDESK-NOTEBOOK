import { z } from "zod";
import { apiGuard } from "@/lib/auth";
import { hasGroqKey, DEFAULT_MODEL } from "@/lib/organize";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  role: z.string(),
  company: z.string(),
  location: z.string().nullable().default(null),
  hrName: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  resumeText: z.string().nullable().default(null),
  portfolioUrl: z.string().nullable().default(null),
  linkedinUrl: z.string().nullable().default(null),
  githubUrl: z.string().nullable().default(null),
  // When enhancing an existing message, we pass it instead of job details.
  existingMessage: z.string().nullable().default(null),
  mode: z.enum(["generate", "enhance"]).default("generate"),
});

const WHATSAPP_SYSTEM_PROMPT = `You write short, professional WhatsApp outreach messages for job seekers.

You will receive:
- A job posting (role, company, location, HR name, notes)
- The candidate's resume text
- The candidate's links (portfolio, LinkedIn, GitHub)

Write a SHORT WhatsApp message (50-80 words, max 10 lines) following this shape:
1. "Hi {HR name}," (use the HR name if given, else just "Hi,")
2. "I'm {candidate name from resume}, a {role} with {X years} experience in {3-5 key skills from resume}."
3. "I'm currently exploring {target role} opportunities. I'm sharing my resume for your consideration."
4. Links the candidate actually has, each on its own line ("Portfolio: ..."). Skip links that are missing.
5. "Thank you for your time and consideration."
6. "Best regards," on its own line, then the candidate's name.

Rules:
- Conversational and human, NOT robotic or overly formal
- Line breaks between each part for readability (WhatsApp supports them)
- Does NOT use markdown formatting (no asterisks, no hashtags)
- Does NOT include a subject line
- Never invent the name, years of experience, or skills — take them from the resume; if the resume is missing, keep it generic ("Software Engineer")
- Keep it tight — respects the reader's time

Return ONLY the message text, nothing else.`;

const ENHANCE_SYSTEM_PROMPT = `You improve WhatsApp outreach messages for job seekers.

You will receive an existing message. Improve it while keeping it SHORT (50-80 words):
1. More natural and conversational
2. Keep the same short shape: greeting, intro, opportunity line, links, thanks, sign-off
3. Better structured with clear line breaks
4. More engaging while staying professional
5. Free of any markdown formatting

Keep the same intent and key information. Return ONLY the improved message text, nothing else.`;

function resolveModel(): string {
  const raw = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
  // Strip surrounding quotes in case the env value was quoted when set.
  return raw.replace(/^["']|["']$/g, "");
}

async function callGroq(
  messages: { role: "system" | "user"; content: string }[]
) {
  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  return groq.chat.completions.create({
    model: resolveModel(),
    temperature: 0.7,
    max_tokens: 2048,
    // gpt-oss is a reasoning model: keep reasoning short so tokens remain
    // for the actual message. Extra params are passed through to Groq.
    ...( { reasoning_effort: "low" } as object ),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

export async function POST(request: Request) {
  const denied = await apiGuard();
  if (denied) return denied;

  if (!hasGroqKey()) {
    return Response.json(
      { error: "GROQ_API_KEY is not set. Add it to .env.local to generate messages." },
      { status: 400 }
    );
  }

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

  const data = parsed.data;

  try {
    let completion;

    if (data.mode === "enhance" && data.existingMessage) {
      completion = await callGroq([
        { role: "system", content: ENHANCE_SYSTEM_PROMPT },
        { role: "user", content: data.existingMessage },
      ]);
    } else {
      const userContent = [
        `JOB POSTING:`,
        `Role: ${data.role}`,
        `Company: ${data.company}`,
        data.location ? `Location: ${data.location}` : null,
        data.hrName ? `HR Contact: ${data.hrName}` : null,
        data.notes ? `Notes: ${data.notes}` : null,
        ``,
        `CANDIDATE RESUME:`,
        data.resumeText || "(No resume provided)",
        ``,
        `CANDIDATE LINKS:`,
        data.portfolioUrl ? `Portfolio: ${data.portfolioUrl}` : null,
        data.linkedinUrl ? `LinkedIn: ${data.linkedinUrl}` : null,
        data.githubUrl ? `GitHub: ${data.githubUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      completion = await callGroq([
        { role: "system", content: WHATSAPP_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ]);
    }

    const rawMsg = completion.choices[0]?.message as
      | { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; refusal?: string | null }
      | undefined;
    const finishReason = (completion.choices[0]?.finish_reason ?? null) as string | null;
    const message =
      rawMsg?.content?.trim() ||
      rawMsg?.reasoning_content?.trim() ||
      rawMsg?.reasoning?.trim() ||
      "";

    if (!message) {
      console.error("[POST /api/whatsapp] empty completion", {
        model: completion.model,
        finishReason,
        refusal: rawMsg?.refusal ?? null,
        usage: completion.usage ?? null,
      });
      return Response.json(
        {
          error:
            finishReason === "length"
              ? "Groq stopped early (token limit). Try again — I raised the limit."
              : finishReason === "content_filter"
                ? "Groq filtered the output. Try again or shorten the resume text."
                : `Groq returned an empty message (model ${completion.model}, finish: ${finishReason ?? "unknown"}). Try again, or switch GROQ_MODEL to openai/gpt-oss-20b.`,
        },
        { status: 500 }
      );
    }

    return Response.json({
      message,
      model: completion.model,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp]", err);
    const detail = err instanceof Error ? err.message : String(err);
    // Surface Groq's own message (bad key, bad model, rate limit) when present.
    const hint = /401|invalid api key|unauthorized/i.test(detail)
      ? "Check your GROQ_API_KEY."
      : /404|model/i.test(detail)
        ? `Check GROQ_MODEL (tried ${resolveModel()}).`
        : /429|rate/i.test(detail)
          ? "Rate limited — wait a minute and try again."
          : "Check your Groq API key.";
    return Response.json(
      { error: `Could not generate message. ${hint} (${detail.slice(0, 160)})` },
      { status: 500 }
    );
  }
}
