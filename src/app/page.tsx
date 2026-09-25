import Link from "next/link";
import { Dashboard } from "@/components/dashboard";
import { getStats, listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

function SetupScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-16">
      <p className="meta">Setup</p>
      <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight">
        Connect your database.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">{message}</p>

      <ol className="mt-8 space-y-4 border-t border-rule pt-8">
        {[
          ["Copy the example file", "cp .env.example .env.local"],
          ["Paste in your Neon pooled connection string as DATABASE_URL", "postgresql://user:pass@ep-xxx.aws.neon.tech/db?sslmode=require"],
          ["Apply the schema", "npm run db:migrate"],
          ["Optional: load sample rows", "npm run db:seed"],
        ].map(([step, cmd], i) => (
          <li key={step} className="grid gap-2 sm:grid-cols-[2rem_1fr] sm:gap-4">
            <span className="meta pt-0.5">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-sm text-ink">{step}</p>
              <code className="mt-1.5 block overflow-x-auto rounded-md border border-rule bg-raised px-3 py-2 font-mono text-xs text-muted">
                {cmd}
              </code>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-sm text-muted">
        Then reload this page, or head to{" "}
        <Link href="/seed" className="text-accent-ink underline underline-offset-2">
          Seed
        </Link>
        .
      </p>
    </div>
  );
}

export default async function Page() {
  let loaded: { jobs: Awaited<ReturnType<typeof listJobs>>; stats: Awaited<ReturnType<typeof getStats>> } | null = null;
  let failure: string | null = null;

  try {
    const [jobs, stats] = await Promise.all([listJobs({ limit: 1000 }), getStats()]);
    loaded = { jobs, stats };
  } catch (err) {
    console.error("[dashboard]", err);
    failure =
      err instanceof Error && err.message.includes("DATABASE_URL")
        ? "DATABASE_URL isn't set yet. Add your Neon connection string to .env.local, then run the migration:"
        : "The database could not be reached. Check DATABASE_URL in .env.local — for Neon, use the pooled connection string and keep sslmode=require.";
  }

  if (!loaded) return <SetupScreen message={failure ?? "Unknown database error."} />;

  return <Dashboard initialJobs={loaded.jobs} initialStats={loaded.stats} />;
}
