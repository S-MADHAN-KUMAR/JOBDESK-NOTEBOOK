# Jobdesk Notebook

A single-user job-search agent: paste messy scraped text, get a clean outreach list.

Two pages:

| Page | What it does |
| --- | --- |
| `/` **Dashboard** | Every job in one spec-sheet table — posted date, role, company, location, HR name, phone, reached/not-reached checkbox. Search + status filters. |
| `/seed` **Seed** | A blank notebook page. Paste or drop raw text (out-of-order fields, several jobs at once) — nothing is mapped until you press **Organise**, which runs Groq and stages structured rows for review before saving. |

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
| `AUTH_USERNAME` / `AUTH_PASSWORD` | Who can sign in to the board. Set both or sign-in is disabled with a 503. |
| `SESSION_SECRET` | Signs the session cookie (`openssl rand -base64 32`). Rotating it signs everyone out. |

## Sign-in

Every page and API is behind `src/proxy.ts` (Next 16's renamed middleware):
unauthenticated page requests redirect to `/login?next=…`, API requests answer
`401`, and static assets stay public.

- Credentials come from `AUTH_USERNAME` / `AUTH_PASSWORD` and are compared in
  constant time (HMAC digests, both sides always evaluated).
- The session is a 7-day HMAC-SHA256-signed cookie (`HttpOnly`, `SameSite=Lax`,
  `Secure` in production) — no third-party auth library, verified in the Edge
  proxy with Web Crypto, so it also runs on the Node runtime.
- Failed logins always take 400 ms, so timing does not leak a partial match.
- **Sign out** sits next to Refresh on the dashboard.

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
| `POST` | `/api/auth/login` | `{username,password}` → sets the session cookie |
| `POST` | `/api/auth/logout` | Clears the session cookie |
| `GET` | `/api/jobs?q=&reached=&limit=&offset=` | List jobs + stats |
| `POST` | `/api/jobs` | Create many jobs |
| `PATCH` | `/api/jobs/:id` | Toggle `reached`, edit fields |
| `DELETE` | `/api/jobs/:id` | Remove one job |
| `POST` | `/api/jobs/bulk` | `{ids:[…]}` → delete many jobs in one round-trip |
| `POST` | `/api/organize` | `{text}` → Groq returns structured job drafts (does not save) |

## How organising works

1. Paste or drop fills the box only — **nothing is mapped until you press
   Organise**. The same is true after a drop: a hint reminds you to organise.
2. `src/lib/organize.ts` sends the text to Groq with a system prompt that
   expects fields in any order, several jobs per paste, explicit `null`s for
   gaps, and — importantly — one row per posting.
3. **One posting, one row.** A contact's designation ("Project Manager") next
   to their name and phone is not a vacancy; the prompt says so with a worked
   example, and `mergePostings()` enforces it afterwards: rows sharing a phone
   number, a contact, or a bare designation card at the same company are
   collapsed, with the discarded label kept in `notes`.
4. Dates normalise to `YYYY-MM-DD` — including relative ages printed in board
   headers ("India · 8 hours ago" → today minus 8 hours, "yesterday", "2 days
   ago"). Application-side timestamps ("Application submitted 2 hours ago",
   "Promoted", "Over 100 applicants") are ignored. Phones are de-noised.
5. Rows appear as a preview — untick any you don't want, then **Add to dashboard**.
6. The raw paste is stored in `ingests` regardless of outcome.

If `GROQ_API_KEY` is missing or Groq errors, a local heuristic parser takes over
(`engine: "local"`), so the app keeps working offline. A single malformed row
from the model no longer voids the whole batch — bad rows are dropped or given
a placeholder rather than failing the parse.

## The board

- **Search + status filters** across role, company, location, HR and phone.
- **Select rows** with the header checkbox (selects everything visible) or
  one at a time, then **Delete N rows** in one round-trip
  (`POST /api/jobs/bulk`).
- **Edit any row in place** — pencil icon → the row becomes inputs → Save or
  Cancel. Edits go through `PATCH /api/jobs/:id` and roll back on failure.
- **Delete a single row** with the trash icon; **Reached** toggles optimistically.

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
