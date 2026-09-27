"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { JobsTable } from "@/components/jobs-table";
import type { Job, JobStats } from "@/lib/jobs";

type StatTone = "accent" | "ok" | "sun" | "sky" | "lilac";

const STAT_TONES: Record<StatTone, { dot: string; value: string }> = {
  accent: { dot: "bg-accent", value: "text-accent-ink" },
  ok: { dot: "bg-ok", value: "text-tint-sage-ink" },
  sun: { dot: "bg-[#2f7ae6]", value: "text-tint-sun-ink" },
  sky: { dot: "bg-[#0ea5e9]", value: "text-tint-sky-ink" },
  lilac: { dot: "bg-[#6366f1]", value: "text-tint-lilac-ink" },
};

function Stat({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: StatTone;
}) {
  const t = STAT_TONES[tone];
  return (
    <div className="min-w-0 rounded-xl border border-rule bg-raised px-4 py-3.5 shadow-card">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${t.dot}`} />
        <p className="meta truncate">{label}</p>
      </div>
      <p className={`mt-2 font-mono text-2xl leading-none tabular-nums sm:text-[1.75rem] ${t.value}`}>
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
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="accent-band mb-6 rounded-2xl border border-rule px-4 py-6 sm:mb-8 sm:px-7 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <p className="meta">Board</p>
            <h1 className="mt-2 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              Every lead, in one sheet.
            </h1>
            <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-muted">
              Rows arrive from the Seed page: paste or drop a raw scrape and the LLM
              sorts role, company, HR contact and phone into place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <button
              onClick={async () => {
                const res = await fetch("/api/jobs");
                if (!res.ok) return;
                const data = await res.json();
                setJobs(data.jobs);
                setStats(data.stats);
              }}
              className="h-10 rounded-lg border border-rule-strong bg-raised/80 px-3.5 text-sm text-muted transition-colors hover:text-ink focus-ring"
            >
              Refresh
            </button>
            <Link
              href="/seed"
              className="col-span-2 flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-ink focus-ring sm:col-span-1"
            >
              + Seed a paste
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total jobs" value={live.total} tone="accent" />
        <Stat label="Reached" value={live.reached} tone="ok" />
        <Stat label="Not reached" value={live.notReached} tone="sun" />
        <Stat label="With phone" value={live.withPhone} tone="sky" />
        <Stat label="Added this week" value={stats.thisWeek} tone="lilac" />
      </div>

      <JobsTable jobs={jobs} onChanged={setJobs} />
    </div>
  );
}
