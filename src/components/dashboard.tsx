"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JobsTable } from "@/components/jobs-table";
import type { Job, JobStats } from "@/lib/jobs";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "accent" }) {
  return (
    <div className="min-w-0 border-l border-rule pl-4 first:border-l-0 first:pl-0">
      <p className="meta">{label}</p>
      <p
        className={`mt-1.5 font-mono text-2xl leading-none tabular-nums ${
          tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent-ink" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

type Props = {
  initialJobs: Job[];
  initialStats: JobStats;
};

export function Dashboard({ initialJobs, initialStats }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [stats, setStats] = useState<JobStats>(initialStats);

  // Derive the strip from live rows so a toggle updates it immediately.
  const live = useMemo(() => {
    const reached = jobs.filter((j) => j.reached).length;
    return {
      ...stats,
      total: jobs.length,
      reached,
      notReached: jobs.length - reached,
      withPhone: jobs.filter((j) => Boolean(j.hrPhone)).length,
    };
  }, [jobs, stats]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="meta">Board</p>
          <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            Every lead, in one sheet.
          </h1>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-muted">
            Rows arrive from the Seed page: paste or drop a raw scrape and the LLM
            sorts role, company, HR contact and phone into place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
            className="h-9 rounded-md border border-rule-strong bg-raised px-3 text-sm text-muted transition-colors hover:text-ink focus-ring"
          >
            Sign out
          </button>
          <button
            onClick={async () => {
              const res = await fetch("/api/jobs");
              if (!res.ok) return;
              const data = await res.json();
              setJobs(data.jobs);
              setStats(data.stats);
            }}
            className="h-9 rounded-md border border-rule-strong bg-raised px-3 text-sm text-muted transition-colors hover:text-ink focus-ring"
          >
            Refresh
          </button>
        <Link
  href="/seed"
  className="h-9 rounded-md bg-ink px-3.5 text-sm font-medium text-paper transition-colors hover:bg-accent focus-ring text-center flex items-center justify-center"
>
  + Seed a paste
</Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-y-6 border-y border-rule-strong py-5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total jobs" value={live.total} />
        <Stat label="Reached" value={live.reached} tone="ok" />
        <Stat label="Not reached" value={live.notReached} tone="accent" />
        <Stat label="With phone" value={live.withPhone} />
        <Stat label="Added this week" value={stats.thisWeek} />
      </div>

      <JobsTable jobs={jobs} onChanged={setJobs} />
    </div>
  );
}
