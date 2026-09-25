import { query, withTransaction } from "@/lib/db";

export type Job = {
  id: string;
  postedDate: string | null;
  role: string;
  company: string;
  location: string | null;
  hrName: string | null;
  hrPhone: string | null;
  reached: boolean;
  sourceUrl: string | null;
  notes: string | null;
  createdAt: string;
};

/** Shape produced by the organizer, before it has an id. */
export type JobDraft = {
  postedDate: string | null;
  role: string;
  company: string;
  location: string | null;
  hrName: string | null;
  hrPhone: string | null;
  sourceUrl: string | null;
  notes: string | null;
};

export type JobFilters = {
  q?: string;
  reached?: "true" | "false";
  limit?: number;
  offset?: number;
};

const SELECT = `
  SELECT
    id,
    to_char(posted_date, 'YYYY-MM-DD')                AS "postedDate",
    role,
    company,
    location,
    hr_name                                           AS "hrName",
    hr_phone                                          AS "hrPhone",
    reached,
    source_url                                        AS "sourceUrl",
    notes,
    created_at                                        AS "createdAt"
  FROM jobs
`;

function buildWhere(filters: JobFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    clauses.push(
      `(role ILIKE $${params.length} OR company ILIKE $${params.length}` +
        ` OR location ILIKE $${params.length} OR hr_name ILIKE $${params.length}` +
        ` OR hr_phone ILIKE $${params.length})`
    );
  }

  if (filters.reached === "true") clauses.push("reached = true");
  if (filters.reached === "false") clauses.push("reached = false");

  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

export async function listJobs(filters: JobFilters = {}): Promise<Job[]> {
  const { where, params } = buildWhere(filters);

  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 1000);
  const offset = Math.max(filters.offset ?? 0, 0);

  params.push(limit, offset);

  return query<Job>(
    `${SELECT}${where}
     ORDER BY posted_date DESC NULLS LAST, created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

export type JobStats = {
  total: number;
  reached: number;
  notReached: number;
  withPhone: number;
  thisWeek: number;
};

export async function getStats(): Promise<JobStats> {
  const rows = await query<{
    total: string;
    reached: string;
    withPhone: string;
    thisWeek: string;
  }>(`
    SELECT
      count(*)                                            AS total,
      count(*) FILTER (WHERE reached)                     AS reached,
      count(*) FILTER (WHERE hr_phone IS NOT NULL)        AS "withPhone",
      count(*) FILTER (WHERE created_at > now() - interval '7 days') AS "thisWeek"
    FROM jobs
  `);

  const total = Number(rows[0]?.total ?? 0);
  const reached = Number(rows[0]?.reached ?? 0);

  return {
    total,
    reached,
    notReached: total - reached,
    withPhone: Number(rows[0]?.withPhone ?? 0),
    thisWeek: Number(rows[0]?.thisWeek ?? 0),
  };
}

export async function createJobs(drafts: JobDraft[]): Promise<Job[]> {
  if (drafts.length === 0) return [];

  return withTransaction(async (client) => {
    const inserted: Job[] = [];

    for (const d of drafts) {
      const res = await client.query(
        `INSERT INTO jobs (posted_date, role, company, location, hr_name, hr_phone, source_url, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING
           id,
           to_char(posted_date, 'YYYY-MM-DD') AS "postedDate",
           role, company, location,
           hr_name   AS "hrName",
           hr_phone  AS "hrPhone",
           reached,
           source_url AS "sourceUrl",
           notes,
           created_at AS "createdAt"`,
        [
          d.postedDate,
          d.role,
          d.company,
          d.location,
          d.hrName,
          d.hrPhone,
          d.sourceUrl,
          d.notes,
        ]
      );
      inserted.push(res.rows[0] as Job);
    }

    return inserted;
  });
}

export type JobPatch = Partial<
  Pick<Job, "postedDate" | "role" | "company" | "location" | "hrName" | "hrPhone" | "reached" | "notes">
>;

const PATCHABLE: (keyof JobPatch)[] = [
  "postedDate",
  "role",
  "company",
  "location",
  "hrName",
  "hrPhone",
  "reached",
  "notes",
];

const COLUMN: Record<string, string> = {
  postedDate: "posted_date",
  role: "role",
  company: "company",
  location: "location",
  hrName: "hr_name",
  hrPhone: "hr_phone",
  reached: "reached",
  notes: "notes",
};

export async function updateJob(id: string, patch: JobPatch): Promise<Job | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const key of PATCHABLE) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) continue;

    params.push(value);
    // Values stay parameterised; only the trusted COLUMN map supplies SQL text.
    sets.push(`${COLUMN[key]} = $${params.length}`);
  }

  if (sets.length === 0) return null;

  params.push(id);

  const rows = await query<Job>(
    `UPDATE jobs SET ${sets.join(", ")}, updated_at = now()
     WHERE id = $${params.length}
     RETURNING
       id,
       to_char(posted_date, 'YYYY-MM-DD') AS "postedDate",
       role, company, location,
       hr_name  AS "hrName",
       hr_phone AS "hrPhone",
       reached,
       source_url AS "sourceUrl",
       notes,
       created_at AS "createdAt"`,
    params
  );

  return rows[0] ?? null;
}

export async function deleteJob(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM jobs WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

/** Bulk delete for the board's multi-select. Returns the ids actually removed. */
export async function deleteJobs(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await query<{ id: string }>(
    `DELETE FROM jobs WHERE id = ANY($1::uuid[]) RETURNING id`,
    [ids]
  );
  return rows.map((r) => r.id);
}
