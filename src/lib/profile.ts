import { query } from "@/lib/db";

export type Profile = {
  id: number;
  resumeText: string | null;
  resumeFilename: string | null;
  resumeData: Buffer | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  updatedAt: string;
};

const SELECT = `
  SELECT
    id,
    resume_text    AS "resumeText",
    resume_filename AS "resumeFilename",
    resume_data    AS "resumeData",
    portfolio_url  AS "portfolioUrl",
    linkedin_url   AS "linkedinUrl",
    github_url     AS "githubUrl",
    updated_at     AS "updatedAt"
  FROM profile
  WHERE id = 1
`;

export async function getProfile(): Promise<Profile | null> {
  try {
    const rows = await query<Profile>(SELECT);
    return rows[0] ?? null;
  } catch {
    // Table may not exist yet (migration not run) — return null gracefully.
    return null;
  }
}

export type ProfileInput = {
  resumeText: string | null;
  resumeFilename: string | null;
  resumeData: Buffer | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
};

export async function saveProfile(input: ProfileInput): Promise<Profile> {
  try {
    const rows = await query<Profile>(
      `INSERT INTO profile (id, resume_text, resume_filename, resume_data, portfolio_url, linkedin_url, github_url, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         resume_text     = EXCLUDED.resume_text,
         resume_filename = EXCLUDED.resume_filename,
         resume_data     = EXCLUDED.resume_data,
         portfolio_url   = EXCLUDED.portfolio_url,
         linkedin_url    = EXCLUDED.linkedin_url,
         github_url      = EXCLUDED.github_url,
         updated_at      = now()
       RETURNING
         id,
         resume_text    AS "resumeText",
         resume_filename AS "resumeFilename",
         resume_data    AS "resumeData",
         portfolio_url  AS "portfolioUrl",
         linkedin_url   AS "linkedinUrl",
         github_url     AS "githubUrl",
         updated_at     AS "updatedAt"`,
      [
        input.resumeText,
        input.resumeFilename,
        input.resumeData,
        input.portfolioUrl,
        input.linkedinUrl,
        input.githubUrl,
      ]
    );
    return rows[0];
  } catch (err) {
    // Table may not exist yet — create it on the fly so the app never breaks.
    await query(
      `CREATE TABLE IF NOT EXISTS profile (
        id              integer PRIMARY KEY DEFAULT 1,
        resume_text     text,
        resume_filename text,
        resume_data     bytea,
        portfolio_url   text,
        linkedin_url    text,
        github_url     text,
        updated_at      timestamptz NOT NULL DEFAULT now()
      )`
    );
    const rows = await query<Profile>(
      `INSERT INTO profile (id, resume_text, resume_filename, resume_data, portfolio_url, linkedin_url, github_url, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, now())
       RETURNING
         id,
         resume_text    AS "resumeText",
         resume_filename AS "resumeFilename",
         resume_data    AS "resumeData",
         portfolio_url  AS "portfolioUrl",
         linkedin_url   AS "linkedinUrl",
         github_url     AS "githubUrl",
         updated_at     AS "updatedAt"`,
      [
        input.resumeText,
        input.resumeFilename,
        input.resumeData,
        input.portfolioUrl,
        input.linkedinUrl,
        input.githubUrl,
      ]
    );
    return rows[0];
  }
}
