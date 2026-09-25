-- JOBDESK-NOTEBOOK schema
-- Runs unchanged on local Postgres and on Neon (Postgres 14+; gen_random_uuid is built in).

CREATE TABLE IF NOT EXISTS jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_date  date,
  role         text        NOT NULL,
  company      text        NOT NULL,
  location     text,
  hr_name      text,
  hr_phone     text,
  reached      boolean     NOT NULL DEFAULT false,
  source_url   text,
  notes        text,
  raw_text     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Every raw paste is kept so a bad LLM parse can be re-run later.
CREATE TABLE IF NOT EXISTS ingests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text   text        NOT NULL,
  engine     text        NOT NULL,          -- 'groq' | 'local'
  model      text,                          -- e.g. llama-3.3-70b-versatile
  job_count  integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_posted_date_idx ON jobs (posted_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS jobs_reached_idx     ON jobs (reached);
CREATE INDEX IF NOT EXISTS jobs_company_idx     ON jobs (lower(company));
CREATE INDEX IF NOT EXISTS jobs_created_at_idx  ON jobs (created_at DESC);
