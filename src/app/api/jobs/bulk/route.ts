import { z } from "zod";
import { deleteJobs } from "@/lib/jobs";
import { apiGuard } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deleteSchema = z.object({
  ids: z.array(z.string().regex(UUID_RE, "Invalid job id.")).min(1, "Select at least one row.").max(1000),
});

/** POST /api/jobs/bulk — { ids: string[] } → delete many rows in one round-trip. */
export async function POST(request: Request) {
  const denied = await apiGuard();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const deleted = await deleteJobs(parsed.data.ids);
    return Response.json({ deleted: deleted.length, ids: deleted });
  } catch (err) {
    console.error("[POST /api/jobs/bulk]", err);
    return Response.json({ error: "Could not delete those rows." }, { status: 500 });
  }
}
