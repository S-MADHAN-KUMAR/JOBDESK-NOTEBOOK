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
  // Nullable on purpose: one odd row must not void the whole batch.
  role: nullable.default(null),
  company: nullable.default(null),
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

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Normalise every date the scraper throws at us into `YYYY-MM-DD`.
 * Day-first for slash dates (the dominant convention in IN job boards).
 * Returns null rather than guessing when the input is unusable.
 */
export function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Relative ages: "8 hours ago", "Posted 2 days ago", "3 hrs ago".
  // Boards print these in the header line — that IS the posted time.
  const rel = raw.match(
    /^(?:posted\s+|posted\s+on\s+|published\s+)?(\d{1,4})\s*(mins?|minutes?|hours?|hrs?|hr|h|days?|weeks?|wks?|months?|years?|yrs?)\s+ago\b/i
  );
  if (rel) {
    const n = Number(rel[1]);
    const u = rel[2].toLowerCase();
    const ms = u.startsWith("min")
      ? n * 60_000
      : u.startsWith("hour") || u.startsWith("hr") || u === "h"
        ? n * 3_600_000
        : u.startsWith("week") || u.startsWith("wk") || u === "w"
          ? n * 604_800_000
          : u.startsWith("month")
            ? n * 2_592_000_000
            : u.startsWith("year") || u.startsWith("yr")
              ? n * 31_536_000_000
              : n * 86_400_000;
    return isoOf(new Date(Date.now() - ms));
  }
  if (/^(?:posted\s+|last\s+)?yesterday\b/i.test(raw)) return isoOf(new Date(Date.now() - 86_400_000));
  if (/^(?:posted\s+)?(?:today|just now|now)\b/i.test(raw)) return isoOf(new Date());

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
    role: d.role ?? "",
    company: d.company ?? "Unknown company",
    location: d.location,
    hrName: d.hrName,
    hrPhone: normalizePhone(d.hrPhone),
    sourceUrl: d.sourceUrl,
    notes: d.notes,
  };
}

/* ------------------------------------------------------------------ *
 * Merge pass: one posting must not become two rows.
 *
 * Scrapes often print a contact's designation ("Project Manager") next to
 * their name and phone, then the real vacancy ("React developer") below it.
 * Models occasionally emit both as separate jobs. Anything that shares a
 * phone number or a company + contact is the same posting → collapse it.
 * ------------------------------------------------------------------ */

/** Job-ish words. A role without any of these is probably a person's designation. */
const JOB_FAMILY =
  /\b(engineer|developer|designer|analyst|architect|devops|sre|qa|tester|writer|researcher|intern|consultant|specialist|scientist|assistant|executive|recruiter|marketing|sales|representative|officer|nurse|doctor|technician|operator|graduate|trainee|head|lead|architect|chef|cook|driver|teacher|tutor|lawyer|accountant|auditor|engineer)\b/i;

const DESIGNATION_ONLY =
  /^\s*(project manager|product manager|program manager|business development|hr|human resources|recruiter|hiring|talent|founder|ceo|cto|coordinator|administrator|admin|owner|partner|director|head of|team lead)\b/i;

const digits = (v: string | null) => (v ? v.replace(/\D/g, "") : "");
const key = (v: string | null) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function isProbablyDesignation(role: string): boolean {
  // A known contact title, or a short label with no job-family word.
  return DESIGNATION_ONLY.test(role) || !JOB_FAMILY.test(role);
}

/** Prefer the field that says more; otherwise the first non-null wins. */
function pick<T extends string | null>(a: T, b: T): T {
  if (!a) return b;
  if (!b) return a;
  return (b.length > a.length ? b : a) as T;
}

function mergePair(a: JobDraft, b: JobDraft): JobDraft {
  // Which row carries the actual vacancy? The one whose role reads like a job,
  // or — if both do — the one that is not just a contact card.
  const aDesignation = isProbablyDesignation(a.role);
  const bDesignation = isProbablyDesignation(b.role);

  let keep: JobDraft;
  let drop: JobDraft;
  if (aDesignation !== bDesignation) {
    [keep, drop] = aDesignation ? [b, a] : [a, b];
  } else {
    const aHasContact = Boolean(a.hrName || a.hrPhone);
    const bHasContact = Boolean(b.hrName || b.hrPhone);
    [keep, drop] = aHasContact === bHasContact ? [a, b] : bHasContact ? [b, a] : [a, b];
  }

  const droppedLabel = key(drop.role) !== key(keep.role) ? drop.role : null;
  let notes = keep.notes ?? drop.notes ?? null;
  if (droppedLabel) {
    notes = notes
      ? notes.toLowerCase().includes(droppedLabel.toLowerCase())
        ? notes
        : `${notes} · ${droppedLabel}`.slice(0, 120)
      : `Also listed as: ${droppedLabel}`.slice(0, 120);
  }

  // Locations are often "Kochi, Kerala, India" + "Remote" for the same job.
  const location =
    keep.location && drop.location
      ? key(keep.location) === key(drop.location)
        ? keep.location
        : `${keep.location} · ${drop.location}`.slice(0, 160)
      : (keep.location ?? drop.location);

  return {
    postedDate: keep.postedDate ?? drop.postedDate,
    role: keep.role,
    company: pick(keep.company, drop.company),
    location,
    hrName: keep.hrName ?? drop.hrName,
    hrPhone: keep.hrPhone ?? drop.hrPhone,
    sourceUrl: keep.sourceUrl ?? drop.sourceUrl,
    notes,
  };
}

function samePosting(a: JobDraft, b: JobDraft): boolean {
  const [pa, pb] = [digits(a.hrPhone), digits(b.hrPhone)];
  if (pa && pb && pa === pb) return true; // same contact number → same posting

  const [ca, cb] = [key(a.company), key(b.company)];
  if (ca && ca === cb) {
    // Same company: merge when a contact or location is shared, or when one
    // side is a bare designation card with no vacancy detail of its own.
    // Same contact person on both rows → same posting.
    if (a.hrName && b.hrName && key(a.hrName) === key(b.hrName)) return true;
    // One row is a bare contact-designation card (no date/link of its own) → fold it in.
    if (isProbablyDesignation(a.role) && !a.postedDate && !a.sourceUrl) return true;
    if (isProbablyDesignation(b.role) && !b.postedDate && !b.sourceUrl) return true;
  }
  return false;
}

/** Collapse rows that describe one posting. Order-preserving, single pass + repeat. */
export function mergePostings(drafts: JobDraft[]): JobDraft[] {
  const out: JobDraft[] = [];
  for (const draft of drafts) {
    let merged = false;
    for (let i = 0; i < out.length; i++) {
      if (samePosting(out[i], draft)) {
        out[i] = mergePair(out[i], draft);
        merged = true;
        break;
      }
    }
    if (!merged) out.push(draft);
  }
  // Merging can expose a new duplicate (A~B, then C~result) — run until stable.
  if (out.length === drafts.length) return out;
  return mergePostings(out);
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

CRITICAL — one posting, one row:
- Several lines in one block almost always describe the SAME posting. Company,
  location, contact name, contact designation and phone are context for ONE job,
  not several jobs.
- A "designation" (Project Manager, HR Executive, Recruiter, Founder, CEO …)
  sitting next to a person's name or phone is the CONTACT'S job title, not a
  vacancy. Never emit it as its own row.
- Only split the text into two rows when the two rows would have different
  companies, or different roles at clearly different postings.
- If the same company appears twice in one paste, merge into one row.

Field rules:
- "role" is the ACTUAL vacancy being hiring for (e.g. "React developer"). It is
  not the contact's designation.
- "company" is the hiring company. Never put a person's name here. If the
  company is not stated, return the string "Unknown company" — never null.
- "hrName" is the recruiter / HR contact's personal name, if any is given.
- "hrPhone" is that contact's phone number exactly as written, keeping the +
  country code. Do not invent one.
- "location" is the city, state or "Remote" as stated.
- "postedDate" is when the job was POSTED, ISO format YYYY-MM-DD.
  - Absolute dates: "25 Sep 2026", "2026-09-25", "25/09/2026".
  - Relative ages are common in board headers ("India · 8 hours ago · Over 100
    applicants"). Convert them to a date: "8 hours ago" → today's date minus
    8 hours; "2 days ago" → today minus 2 days; "yesterday" → today minus 1.
  - Ignore anything about YOUR application, not the posting: "Application
    submitted 2 hours ago", "Promoted", "Over 100 applicants", "No response
    insights". Never use those as postedDate.
  - If no posting time is stated at all, return null — never guess.
- "sourceUrl" is a link if one is present, else null.
- "notes" is a short line for anything worth keeping that fits nowhere else
  (salary, experience required, shift, contract type, the contact's designation).
  Keep it under 120 chars.
- Use null for any field that is genuinely absent. Never leave a blank string.
- Do not drop a job just because it is missing details.
- If the text contains no job posting at all, return {"jobs":[]}.

Example — the contact's designation must NOT become a second row:
Input:
  Project Manager
  Portable Medical Technology Ltd. (ONCOassist®)
  Kochi, Kerala, India
  Subash KB
  +91 94465 90590
  React developer
  Portable Medical Technology Ltd. (ONCOassist®)
  Remote
Output:
  {"jobs":[{"postedDate":null,"role":"React developer","company":"Portable Medical Technology Ltd. (ONCOassist®)","location":"Kochi, Kerala, India · Remote","hrName":"Subash KB","hrPhone":"+91 94465 90590","sourceUrl":null,"notes":"Contact designation: Project Manager"}]}

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
    jobs: mergePostings(
      parsed.jobs.map(normalizeDraft).filter((j) => j.role.trim().length > 0)
    ),
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
      /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,4}\s+(?:mins?|minutes?|hours?|hrs?|days?|weeks?|months?|years?)\s+ago|yesterday)\b/
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
      return { ...fallback, jobs: mergePostings(fallback.jobs), model: `fallback after error` };
    }
  }

  const local = organizeLocally(text);
  return { ...local, jobs: mergePostings(local.jobs) };
}
