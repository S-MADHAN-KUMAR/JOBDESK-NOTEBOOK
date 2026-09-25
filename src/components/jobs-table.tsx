"use client";

import { useMemo, useState, useTransition } from "react";
import type { Job } from "@/lib/jobs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Editable copy of a row — every field the PATCH endpoint accepts. */
type Draft = {
  postedDate: string;
  role: string;
  company: string;
  location: string;
  hrName: string;
  hrPhone: string;
  notes: string;
};

function toDraft(job: Job): Draft {
  return {
    postedDate: job.postedDate ?? "",
    role: job.role,
    company: job.company,
    location: job.location ?? "",
    hrName: job.hrName ?? "",
    hrPhone: job.hrPhone ?? "",
    notes: job.notes ?? "",
  };
}

const cellInput =
  "h-8 w-full rounded-md border border-rule-strong bg-raised px-2 text-sm text-ink placeholder:text-faint focus-ring";

type Props = {
  jobs: Job[];
  onChanged: (jobs: Job[]) => void;
};

type ReachFilter = "all" | "reached" | "not-reached";

export function JobsTable({ jobs, onChanged }: Props) {
  const [q, setQ] = useState("");
  const [reach, setReach] = useState<ReachFilter>("all");
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Multi-select for bulk delete.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  // Inline editing: only one row at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((job) => {
      if (reach === "reached" && !job.reached) return false;
      if (reach === "not-reached" && job.reached) return false;
      if (!needle) return true;
      return [job.role, job.company, job.location, job.hrName, job.hrPhone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [jobs, q, reach]);

  const visibleIds = useMemo(() => visible.map((j) => j.id), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function toggleReached(job: Job) {
    const next = !job.reached;
    setPendingId(job.id);
    setError(null);

    // Optimistic — flip instantly, roll back if the PATCH fails.
    onChanged(jobs.map((j) => (j.id === job.id ? { ...j, reached: next } : j)));

    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reached: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError("Could not save that change.");
      onChanged(jobs.map((j) => (j.id === job.id ? { ...j, reached: !next } : j)));
      console.error(err);
    } finally {
      setPendingId(null);
    }
  }

  async function remove(job: Job) {
    if (!confirm(`Delete the ${job.role} role at ${job.company}?`)) return;
    setPendingId(job.id);
    setError(null);

    const previous = jobs;
    onChanged(jobs.filter((j) => j.id !== job.id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(job.id);
      return next;
    });

    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError("Could not delete that row.");
      onChanged(previous);
      console.error(err);
    } finally {
      setPendingId(null);
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "row" : "rows"}? This cannot be undone.`)) return;

    setBulkPending(true);
    setError(null);
    const previous = jobs;
    onChanged(jobs.filter((j) => !selected.has(j.id)));
    setSelected(new Set());

    try {
      const res = await fetch("/api/jobs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    } catch (err) {
      setError("Could not delete those rows.");
      onChanged(previous);
      console.error(err);
    } finally {
      setBulkPending(false);
    }
  }

  function startEdit(job: Job) {
    setEditingId(job.id);
    setDraft(toDraft(job));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(job: Job) {
    if (!draft) return;
    if (!draft.role.trim() || !draft.company.trim()) {
      setError("Role and company are required.");
      return;
    }

    setSavingEdit(true);
    setError(null);

    const payload = {
      postedDate: draft.postedDate || null,
      role: draft.role.trim(),
      company: draft.company.trim(),
      location: draft.location.trim() || null,
      hrName: draft.hrName.trim() || null,
      hrPhone: draft.hrPhone.trim() || null,
      notes: draft.notes.trim() || null,
    };

    const previous = jobs;
    onChanged(jobs.map((j) => (j.id === job.id ? { ...j, ...payload } : j)));

    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      onChanged(jobs.map((j) => (j.id === job.id ? { ...j, ...payload, ...data.job } : j)));
      cancelEdit();
    } catch (err) {
      setError("Could not save that row.");
      onChanged(previous);
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  }

  const filters: { key: ReachFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: jobs.length },
    { key: "not-reached", label: "Not reached", count: jobs.filter((j) => !j.reached).length },
    { key: "reached", label: "Reached", count: jobs.filter((j) => j.reached).length },
  ];

  return (
    <section aria-label="Jobs">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search role, company, HR, phone…"
            aria-label="Search jobs"
            className="h-9 w-[min(19rem,70vw)] rounded-md border border-rule-strong bg-raised pr-3 pl-8 text-sm placeholder:text-faint focus-ring"
          />
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-rule-strong bg-raised p-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => startTransition(() => setReach(f.key))}
              aria-pressed={reach === f.key}
              className={`rounded px-2.5 py-1.5 text-xs transition-colors focus-ring ${
                reach === f.key
                  ? "bg-ink text-paper"
                  : "text-muted hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 font-mono text-[10px] ${reach === f.key ? "opacity-70" : "text-faint"}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <p className="meta ml-auto">
          {visible.length} of {jobs.length} shown
        </p>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-accent bg-accent-wash px-3 py-2">
          <p className="meta text-accent-ink">
            {selected.size} selected
          </p>
          <button
            onClick={() => setSelected(new Set())}
            disabled={bulkPending}
            className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40 focus-ring"
          >
            Clear selection
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkPending}
            className="ml-auto h-8 rounded-md bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
          >
            {bulkPending ? "Deleting…" : `Delete ${selected.size} ${selected.size === 1 ? "row" : "rows"}`}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="spec-table min-w-[1100px]">
          <thead>
            <tr>
              <th scope="col" className="w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  disabled={visibleIds.length === 0}
                  aria-label="Select all visible rows"
                  className="size-4 accent-[var(--accent)] focus-ring"
                />
              </th>
              <th scope="col" className="w-[7.5rem]">Posted</th>
              <th scope="col">Role</th>
              <th scope="col">Company</th>
              <th scope="col">Location</th>
              <th scope="col">HR</th>
              <th scope="col">Phone</th>
              <th scope="col" className="w-[13rem]">Notes</th>
              <th scope="col" className="w-[7rem] text-right">Reached</th>
              <th scope="col" className="w-16"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center">
                  <p className="text-sm text-muted">
                    {jobs.length === 0 ? "No jobs yet." : "Nothing matches that filter."}
                  </p>
                  <p className="meta mt-2">
                    {jobs.length === 0 ? "Paste your first posting on the Seed page" : "Try a different search"}
                  </p>
                </td>
              </tr>
            )}

            {visible.map((job) => {
              const editing = editingId === job.id && draft !== null;

              if (editing) {
                return (
                  <tr key={job.id} aria-busy={savingEdit} className="row-lift bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]">
                    <td className="pr-2" />
                    <td>
                      <input
                        type="date"
                        value={draft.postedDate}
                        onChange={(e) => setDraft({ ...draft, postedDate: e.target.value })}
                        aria-label="Posted date"
                        className={`${cellInput} font-mono text-xs tabular-nums`}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.role}
                        onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                        aria-label="Role"
                        className={`${cellInput} font-medium`}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.company}
                        onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                        aria-label="Company"
                        className={cellInput}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.location}
                        onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                        aria-label="Location"
                        placeholder="—"
                        className={cellInput}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.hrName}
                        onChange={(e) => setDraft({ ...draft, hrName: e.target.value })}
                        aria-label="HR name"
                        placeholder="—"
                        className={cellInput}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.hrPhone}
                        onChange={(e) => setDraft({ ...draft, hrPhone: e.target.value })}
                        aria-label="HR phone"
                        placeholder="—"
                        className={`${cellInput} font-mono text-xs`}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        aria-label="Notes"
                        placeholder="notes"
                        className={cellInput}
                      />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={job.reached}
                          onChange={() => toggleReached(job)}
                          className="size-4 cursor-pointer accent-[var(--accent)] focus-ring"
                        />
                        <span className={`meta ${job.reached ? "text-ok" : "text-faint"}`}>
                          {job.reached ? "Reached" : "Not yet"}
                        </span>
                      </label>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        onClick={() => saveEdit(job)}
                        disabled={savingEdit}
                        className="h-8 rounded-md bg-ink px-2.5 text-xs font-medium text-paper transition-colors hover:bg-accent disabled:opacity-40 focus-ring"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="ml-1.5 h-8 rounded-md border border-rule-strong bg-raised px-2.5 text-xs text-muted transition-colors hover:text-ink disabled:opacity-40 focus-ring"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={job.id}
                  className="row-lift row-lift-hover group"
                  aria-busy={pendingId === job.id}
                >
                  <td className="pr-2">
                    <input
                      type="checkbox"
                      checked={selected.has(job.id)}
                      onChange={() => toggleSelect(job.id)}
                      aria-label={`Select ${job.role} at ${job.company}`}
                      className="size-4 accent-[var(--accent)] focus-ring"
                    />
                  </td>

                  <td className="font-mono text-xs text-muted tabular-nums whitespace-nowrap">
                    {formatDate(job.postedDate)}
                  </td>

                  <td className="font-medium text-ink">{job.role}</td>

                  <td className="text-ink">{job.company}</td>

                  <td className="text-muted">
                    {job.location ?? <span className="text-faint">—</span>}
                  </td>

                  <td>
                    {job.hrName ? (
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-wash font-mono text-[10px] text-accent-ink"
                        >
                          {initials(job.hrName)}
                        </span>
                        <span className="text-ink">{job.hrName}</span>
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap">
                    {job.hrPhone ? (
                      <a
                        href={telHref(job.hrPhone)}
                        className="font-mono text-xs text-accent-ink underline-offset-2 hover:underline focus-ring"
                      >
                        {job.hrPhone}
                      </a>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>

                  <td className="max-w-[13rem] truncate text-xs text-muted" title={job.notes ?? ""}>
                    {job.notes ?? <span className="text-faint">—</span>}
                  </td>

                  <td className="text-right">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={job.reached}
                        onChange={() => toggleReached(job)}
                        className="size-4 cursor-pointer accent-[var(--accent)] focus-ring"
                      />
                      <span
                        className={`meta ${job.reached ? "text-ok" : "text-faint"}`}
                      >
                        {job.reached ? "Reached" : "Not yet"}
                      </span>
                    </label>
                  </td>

                  <td className="pr-0 text-right">
                    <span className="inline-flex items-center gap-1">
                      <button
                        onClick={() => startEdit(job)}
                        aria-label={`Edit ${job.role} at ${job.company}`}
                        className="rounded p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] hover:text-ink focus-ring focus-visible:opacity-100"
                      >
                        <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 6.5l3 3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => remove(job)}
                        aria-label={`Delete ${job.role} at ${job.company}`}
                        className="rounded p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[color-mix(in_oklab,var(--red,#dc2626)_10%,transparent)] hover:text-red-600 focus-ring focus-visible:opacity-100"
                      >
                        <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
