import { z } from "zod";
import { createJobs, getStats, listJobs, type JobFilters } from "@/lib/jobs";
import { apiGuard } from "@/lib/auth";

export const dynamic = "force-dynamic";

const draftSchema = z.object({
  postedDate: z.string().nullable().default(null),
  role: z.string().min(1),
  company: z.string().min(1),
  location: z.string().nullable().default(null),
  hrName: z.string().nullable().default(null),
  hrPhone: z.string().nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

const createSchema = z.object({
  jobs: z.array(draftSchema).min(1).max(200),
});

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const denied = await apiGuard();
  if (denied) return denied;

  const url = new URL(request.url);

  const filters: JobFilters = {
    q: url.searchParams.get("q") ?? undefined,
    reached: (url.searchParams.get("reached") as JobFilters["reached"]) ?? undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
    offset: Number(url.searchParams.get("offset")) || undefined,
  };

  try {
    const [jobs, stats] = await Promise.all([listJobs(filters), getStats()]);
    return Response.json({ jobs, stats });
  } catch (err) {
    console.error("[GET /api/jobs]", err);
    return Response.json(
      { error: "Could not read jobs. Is DATABASE_URL set correctly?" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = await apiGuard();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON.");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join("; "));
  }

  try {
    const jobs = await createJobs(parsed.data.jobs);
    return Response.json({ jobs }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/jobs]", err);
    return Response.json({ error: "Could not save jobs." }, { status: 500 });
  }
}
