import { z } from "zod";
import { deleteJob, updateJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    postedDate: z.string().nullable().optional(),
    role: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    location: z.string().nullable().optional(),
    hrName: z.string().nullable().optional(),
    hrPhone: z.string().nullable().optional(),
    reached: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const job = await updateJob(id, parsed.data);
    if (!job) {
      return Response.json({ error: "Job not found." }, { status: 404 });
    }
    return Response.json({ job });
  } catch (err) {
    console.error("[PATCH /api/jobs/:id]", err);
    return Response.json({ error: "Could not update job." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  try {
    const removed = await deleteJob(id);
    if (!removed) {
      return Response.json({ error: "Job not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/jobs/:id]", err);
    return Response.json({ error: "Could not delete job." }, { status: 500 });
  }
}
