import { z } from "zod";
import type { JobDraft } from "@/lib/jobs";

/* ------------------------------------------------------------------ *
 * Shared: the shape the organizer must return, plus normalisation.
 * ------------------------------------------------------------------ */

const nullable = z
  .string()
  .transform((s) => s.trim())
  .nullable()
  .transform((v) => (v && v.length > 0 && v !== "null" && v !== "N/A" ? v : null));

const draftSchema = z.object({
  postedDate: nullable.or(z.literal("").transform(() => null)).default(null),
  role: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  company: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  location: nullable.default(null),
  hrName: nullable.default(null),
  hrPhone: nullable.default(null),
  sourceUrl: nullable.default(null),
  notes: nullable.default(null),
});

const envelopeSchema = z.object({
  jobs: z.array(draftSchema).max(200),
});

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Normalise every date the scraper throws at us into `YYYY-MM-DD`.
 * Day-first for slash dates (the dominant convention in IN job boards).
 * Returns null rather than guessing when the input is unusable.
 */
export function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // 2026-09-18 / 2026/09/18 / 2026.09.18
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;

  // 18/09/2026 or 18-09-2026 (day first)
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    if (+mo <= 12) return `${y}-${pad(+mo)}-${pad(+d)}`;
  }

  // 18 Sep 2026 / 18 September 2026 / 18th of Sep, 2026
  m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`;
  }

  // Sep 18, 2026 / September 18 2026
  m = raw.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[2])}`;
  }

  // Last resort: let the engine parse it, but only if it produced a real year.
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  return null;
}

/** Keep phone numbers readable: collapse whitespace, preserve + and separators. */
export function normalizePhone(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  // Too few digits to be a phone number — likely a noise match.
  if (digits.replace(/\D/g, "").length < 7) return null;
  return trimmed.replace(/\s{2,}/g, " ");
}

function normalizeDraft(d: z.infer<typeof draftSchema>): JobDraft {
  return {
    postedDate: normalizeDate(d.postedDate),
    role: d.role,
    company: d.company,
    location: d.location,
    hrName: d.hrName,
    hrPhone: normalizePhone(d.hrPhone),
    sourceUrl: d.sourceUrl,
    notes: d.notes,
  };
}

/* ------------------------------------------------------------------ *
 * Groq: the primary engine.
 * ------------------------------------------------------------------ */

/**
 * Default model, chosen from the models this key can actually call.
 * Llama 3.1/3.3 are Enterprise-gated on Groq and 404 on standard keys;
 * gpt-oss-120b is the flagship open-weight model (131k ctx, ~500 t/s).
 * Full list: GET https://api.groq.com/openai/v1/models
 */
export const DEFAULT_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You clean up messy job-search notes into structured JSON.

You will receive raw text pasted by a job seeker. It is scraped from job boards,
WhatsApp messages, email threads and PDFs. Fields are almost always OUT OF ORDER
and mixed together: the HR contact's phone number may appear before the company
name, the date may be anywhere, and one paste may contain SEVERAL separate jobs.

Extract every distinct job posting you can identify.

Rules:
- "role" is the job title (e.g. "Senior Frontend Engineer").
- "company" is the hiring company. Never put the HR person's name here.
- "hrName" is the recruiter / HR contact's personal name, if any is given.
- "hrPhone" is that contact's phone number exactly as written, keeping the +
  country code. Do not invent one.
- "location" is the city, state or "Remote" as stated.
- "postedDate" must be ISO format YYYY-MM-DD. Use null if no date is stated —
  never guess or use today's date.
- "sourceUrl" is a link if one is present, else null.
- "notes" is a short line for anything worth keeping that fits nowhere else
  (salary, experience required, shift, contract type). Keep it under 120 chars.
- Use null for any field that is genuinely absent. Never leave a blank string.
- Do not drop a job just because it is missing details.
- If the text contains no job posting at all, return {"jobs":[]}.

Return ONLY a JSON object of this exact shape:
{"jobs":[{"postedDate":"YYYY-MM-DD"|null,"role":"...","company":"...","location":"..."|null,"hrName":"..."|null,"hrPhone":"..."|null,"sourceUrl":"..."|null,"notes":"..."|null}]}`;

export type OrganizeResult = {
  jobs: JobDraft[];
  engine: "groq" | "local";
  model: string | null;
  usage?: { promptTokens: number; completionTokens: number };
};

export function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

function extractJson(text: string): unknown {
  // Strip markdown fences if the model added them anyway.
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("Model did not return parseable JSON");
  }
}

async function callGroq(rawText: string, jsonMode: boolean) {
  const { default: Groq } = await import("groq-sdk");

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  return groq.chat.completions.create({
    model: process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL,
    temperature: 0,
    max_tokens: 4096,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `RAW NOTES:\n\n${rawText}` },
    ],
  });
}

async function organizeWithGroq(rawText: string): Promise<OrganizeResult> {
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  let completion;
  try {
    completion = await callGroq(rawText, true);
  } catch {
    // Some models reject response_format; retry in plain mode.
    completion = await callGroq(rawText, false);
  }

  const content = completion.choices[0]?.message?.content ?? "";
  const parsed = envelopeSchema.parse(extractJson(content));

  return {
    jobs: parsed.jobs.map(normalizeDraft),
    engine: "groq",
    model: completion.model ?? model,
    usage: completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
        }
      : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Local fallback: no key required, good enough to keep working offline.
 * ------------------------------------------------------------------ */

const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /https?:\/\/[^\s<>"')]+/;

const ROLE_HINTS =
  /\b(engineer|developer|designer|analyst|manager|lead|architect|devops|sre|qa|tester|writer|researcher|intern|consultant|director|specialist|scientist|assistant|executive|marketing|sales|recruiter|hr)\b/i;

const HR_HINTS =
  /\b(?:hr|recruiter|hiring|talent|people ops|contact|hiring manager|ta)\b\s*[:\-–]\s*([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3})/i;

const SEPARATOR = /\n\s*\n(?=\S)/;

function splitBlocks(text: string): string[] {
  const byBlank = text.split(SEPARATOR).map((b) => b.trim()).filter(Boolean);
  // A single wall of text: fall back to line-based grouping.
  if (byBlank.length <= 1) {
    return text
      .split(/\n(?=(?:https?:\/\/|[A-Z0-9._%+-]+@)|\n)/)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  return byBlank;
}

function organizeLocally(rawText: string): OrganizeResult {
  const blocks = splitBlocks(rawText);
  const jobs: JobDraft[] = [];

  for (const block of blocks) {
    const url = block.match(URL_RE)?.[0] ?? null;

    const phoneMatch = block.match(PHONE_RE);
    const hrPhone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;

    const dateMatch = block.match(
      /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/
    );
    const postedDate = dateMatch ? normalizeDate(dateMatch[0]) : null;

    const hrName =
      block.match(HR_HINTS)?.[1]?.trim() ??
      block.match(/\b(?:contact|reach out to)\s*:?\s*([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3})/i)?.[1]?.trim() ??
      null;

    const lines = block
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[•\-–*>#]+\s*/, "").trim())
      .filter(Boolean);

    const roleLine = lines.find((l) => ROLE_HINTS.test(l) && l.length < 90);

    // Company: prefer an explicit label, else a line that names a firm.
    const company =
      block.match(/\b(?:company|hiring company|organisation|organization)\s*[:\-–]\s*([^\n|,]+)/i)?.[1]?.trim() ??
      lines.find(
        (l) =>
          l !== roleLine &&
          l.length < 60 &&
          /\b(inc|ltd|llc|pvt|limited|technologies|labs|systems|solutions|corp|ai|io|hq)\b\.?$/i.test(l)
      ) ??
      null;

    const location =
      block.match(/\b(?:location|based in|place|city)\s*[:\-–]\s*([^\n|]+)/i)?.[1]?.trim() ??
      lines.find((l) => /\b(remote|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|gurgaon|noida|india|usa|uk|eu)\b/i.test(l) && l.length < 70) ??
      null;

    const role = roleLine ?? lines.find((l) => l.length < 90) ?? null;

    if (!role) continue;

    jobs.push({
      postedDate,
      role: role.slice(0, 120),
      company: (company ?? "Unknown company").slice(0, 120),
      location: location?.slice(0, 120) ?? null,
      hrName: hrName?.slice(0, 80) ?? null,
      hrPhone,
      sourceUrl: url,
      notes: null,
    });
  }

  return { jobs, engine: "local", model: null };
}

/* ------------------------------------------------------------------ *
 * Entry point.
 * ------------------------------------------------------------------ */

/**
 * Turn a raw paste into structured job drafts.
 * Uses Groq when GROQ_API_KEY is present; otherwise the local parser.
 */
export async function organize(rawText: string): Promise<OrganizeResult> {
  const text = rawText.trim();
  if (!text) return { jobs: [], engine: "local", model: null };

  if (hasGroqKey()) {
    try {
      return await organizeWithGroq(text);
    } catch (err) {
      console.error("[organize] Groq failed, falling back to local parser:", err);
      const fallback = organizeLocally(text);
      return { ...fallback, model: `fallback after error` };
    }
  }

  return organizeLocally(text);
}
