import { z } from "zod";
import { getProfile, saveProfile } from "@/lib/profile";
import { apiGuard } from "@/lib/auth";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  resumeText: z.string().max(50_000).nullable().default(null),
  portfolioUrl: z.string().max(500).nullable().default(null),
  linkedinUrl: z.string().max(500).nullable().default(null),
  githubUrl: z.string().max(500).nullable().default(null),
});

export async function GET() {
  try {
    const denied = await apiGuard();
    if (denied) return denied;

    const profile = await getProfile();
    return Response.json({ profile });
  } catch (err) {
    console.error("[GET /api/profile]", err);
    return Response.json({ error: "Could not load profile." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await apiGuard();
    if (denied) return denied;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 }
      );
    }

    const profile = await saveProfile({
      resumeText: parsed.data.resumeText?.trim() || null,
      resumeFilename: null,
      resumeData: null,
      portfolioUrl: parsed.data.portfolioUrl?.trim() || null,
      linkedinUrl: parsed.data.linkedinUrl?.trim() || null,
      githubUrl: parsed.data.githubUrl?.trim() || null,
    });
    return Response.json({ profile });
  } catch (err) {
    console.error("[POST /api/profile]", err);
    return Response.json({ error: "Could not save profile." }, { status: 500 });
  }
}
