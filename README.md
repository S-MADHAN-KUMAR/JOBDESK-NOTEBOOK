# Jobdesk Notebook

A single-user job-search agent: paste messy scraped text, get a clean outreach list.

Two pages:

| Page | What it does |
| --- | --- |
| `/` **Dashboard** | Every job in one spec-sheet table — posted date, role, company, location, HR name, phone, reached/not-reached checkbox. Search + status filters. |
| `/seed` **Seed** | A blank notebook page. Paste or drag raw text (out-of-order fields, several jobs at once) and Groq organises it into structured rows for review before saving. |

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL + GROQ_API_KEY
npm run db:migrate           # apply db/schema.sql
npm run db:seed              # optional: 12 sample rows
npm run dev
```

## Environment

`.env` holds your real credentials. `.env.local` overrides it — **only define keys
here that must win**; anything omitted falls through to `.env`.

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Use the **pooled** Neon endpoint in production. |
| `GROQ_API_KEY` | From <https://console.groq.com/keys>. Leave unset and the app falls back to a local rule-based parser — nothing breaks. |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b`. |

> **Model note:** `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` are
> *Enterprise*-gated on Groq and return `404 model_not_found` on standard keys.
> List what your key can call:
> `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`

## Database

One schema, `db/schema.sql`, runs unchanged on local Postgres and on Neon.

```sql
jobs     -- id, posted_date, role, company, location, hr_name, hr_phone,
         --   reached, source_url, notes, raw_text, timestamps
ingests  -- every raw paste is kept, so a weak parse can be re-run later
```

```bash
npm run db:migrate   # apply schema
npm run db:seed      # insert sample rows
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/jobs?q=&reached=&limit=&offset=` | List jobs + stats |
| `POST` | `/api/jobs` | Create many jobs |
| `PATCH` | `/api/jobs/:id` | Toggle `reached`, edit fields |
| `DELETE` | `/api/jobs/:id` | Remove a job |
| `POST` | `/api/organize` | `{text}` → Groq returns structured job drafts (does not save) |

## How organising works

1. Text arrives by paste, file drop, or the **Organise** button.
2. `src/lib/organize.ts` sends it to Groq with a system prompt that expects
   fields in any order, several jobs per paste, and explicit `null`s for gaps.
3. Dates normalise to `YYYY-MM-DD`, phones are validated and de-noised.
4. Rows appear as a preview — untick any you don't want, then **Add to dashboard**.
5. The raw paste is stored in `ingests` regardless of outcome.

If `GROQ_API_KEY` is missing or Groq errors, a local heuristic parser takes over
(`engine: "local"`), so the app keeps working offline.

## Development

```bash
npm run dev        # Next.js 16, Turbopack
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (next lint was removed in Next 16)
npm run build
```

Local database for development:

```bash
docker run -d --name jobdesk-pg \
  -e POSTGRES_USER=jobdesk -e POSTGRES_PASSWORD=jobdesk -e POSTGRES_DB=jobdesk \
  -p 5433:5432 postgres:16-alpine
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · PostgreSQL
(Neon) · `pg` · Groq (`openai/gpt-oss-120b`) · Zod

## Design

UI tokens come from an [Inspo](https://inspomcp.dev) study of 24 job-search and
dev-tool sites: light paper (83% consensus), grotesk sans (79%), cool accent
(50%). The table follows the editorial spec-sheet archetype — hairline rules,
mono labels, no zebra striping, rows lift on hover.
