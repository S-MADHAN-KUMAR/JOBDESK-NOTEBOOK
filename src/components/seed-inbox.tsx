"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobDraft } from "@/lib/jobs";

type Staged = JobDraft & { key: string; include: boolean };

type OrganizeMeta = {
  engine: "groq" | "local";
  model: string | null;
  groqConfigured: boolean;
  usage: { promptTokens: number; completionTokens: number } | null;
};

const ACCEPTED = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm", ".log", ".rtf"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

let keyCounter = 0;
const nextKey = () => `s${++keyCounter}`;

export function SeedInbox() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [meta, setMeta] = useState<OrganizeMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  const runOrganize = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;

    // A new paste supersedes the in-flight one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError(null);
    setSaved(null);

    try {
      const res = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setStaged(data.jobs.map((j: JobDraft) => ({ ...j, key: nextKey(), include: true })));
      setMeta({
        engine: data.engine,
        model: data.model,
        groqConfigured: data.groqConfigured,
        usage: data.usage ?? null,
      });

      if (data.jobs.length === 0) {
        setError("Nothing that looks like a job posting was found in that text.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not organize that text.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }, []);

  /* Paste: fire as soon as content lands, per the requirement. */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text");
    if (pasted.trim().length < 12) return; // too small to be a posting
    // Let React commit the text first, then organise it.
    setTimeout(() => runOrganize(`${text}${pasted}`), 0);
  }

  /* Drop: files or plain text. */
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) {
      const parts = await Promise.all(
        files.map(async (file) => {
          if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext)) && file.type && !file.type.startsWith("text/")) {
            return "";
          }
          try {
            return await file.text();
          } catch {
            return "";
          }
        })
      );
      const joined = parts.filter(Boolean).join("\n\n").trim();
      if (joined) {
        setText(joined);
        await runOrganize(joined);
        return;
      }
      setError("Drop a text file (.txt, .md, .csv, .json, .html) or plain text.");
      return;
    }

    const dropped = e.dataTransfer.getData("text");
    if (dropped.trim()) {
      setText(dropped);
      await runOrganize(dropped);
      return;
    }

    setError("Nothing droppable was found.");
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  const included = staged.filter((s) => s.include);
  const includedCount = included.length;

  async function save() {
    if (includedCount === 0) return;
    setSaving(true);
    setError(null);

    try {
      const payload = included.map((s) => ({
        postedDate: s.postedDate,
        role: s.role,
        company: s.company,
        location: s.location,
        hrName: s.hrName,
        hrPhone: s.hrPhone,
        sourceUrl: s.sourceUrl,
        notes: s.notes,
      }));
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setSaved(data.jobs.length);
      setStaged([]);
      setText("");
      setMeta(null);
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save those jobs.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-[1440px] px-6 py-10"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="mb-8 max-w-[58ch]">
        <p className="meta">Seed</p>
        <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          A blank page.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Paste or drop the raw scrape — WhatsApp forward, board export, half a PDF.
          Fields arrive out of order; the model puts role, company, HR contact and
          phone back where they belong.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ------------------------------- inbox ------------------------------- */}
        <section aria-label="Paste inbox" className="min-w-0">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              spellCheck={false}
              placeholder={
                "Paste anything here.\n\nSenior Backend Engineer — Zerodha\nBengaluru · 3-5 yrs\nHR: Karthik Iyer\n+91 88670 90123\nPosted 25/09/2026\n\n…order does not matter."
              }
              className="min-h-[26rem] w-full resize-y rounded-lg border border-rule-strong bg-raised p-5 font-mono text-[13px] text-ink placeholder:text-faint focus-ring"
              style={{
                lineHeight: "28px",
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent 0 27px, var(--rule) 27px 28px)",
                backgroundPosition: "0 20px",
                backgroundClip: "padding-box",
              }}
            />

            {dragging && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent-wash/80 backdrop-blur-[1px]">
                <span className="meta text-accent-ink">Drop to organise</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => runOrganize(text)}
              disabled={busy || !text.trim()}
              className="h-9 rounded-md bg-ink px-3.5 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
            >
              {busy ? "Organising…" : "Organise"}
            </button>

            <button
              onClick={() => {
                setText("");
                setStaged([]);
                setMeta(null);
                setError(null);
                setSaved(null);
                textareaRef.current?.focus();
              }}
              disabled={!text && staged.length === 0}
              className="h-9 rounded-md border border-rule-strong bg-raised px-3 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40 focus-ring"
            >
              Clear
            </button>

            <p className="meta ml-auto">
              {busy ? "Reading…" : `${text.length.toLocaleString()} chars`}
            </p>
          </div>

          {meta && !busy && (
            <p className="meta mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`inline-block size-1.5 rounded-full ${meta.groqConfigured ? "bg-ok" : "bg-faint"}`}
                aria-hidden
              />
              {meta.groqConfigured ? `Groq · ${meta.model}` : "Local parser · add GROQ_API_KEY to use Groq"}
              {meta.usage && (
                <span className="text-faint">
                  · {(meta.usage.promptTokens + meta.usage.completionTokens).toLocaleString()} tokens
                </span>
              )}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {error}
            </p>
          )}

          {saved !== null && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Saved {saved} {saved === 1 ? "job" : "jobs"} to the board.{" "}
              <Link href="/" className="font-medium underline underline-offset-2">
                Open dashboard →
              </Link>
            </div>
          )}
        </section>

        {/* ------------------------------ preview ------------------------------ */}
        <section aria-label="Organised preview" className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-rule-strong pb-3">
            <p className="meta">Organised output</p>
            <p className="meta">
              {staged.length === 0
                ? "Waiting for a paste"
                : `${includedCount} ready to save`}
            </p>
          </div>

          {staged.length === 0 ? (
            <div className="rounded-lg border border-dashed border-rule-strong px-6 py-14 text-center">
              <p className="text-sm text-muted">
                {busy ? "Reading your paste…" : "Nothing organised yet."}
              </p>
              <p className="meta mt-2">
                {busy ? "Extracting role, company, HR and phone" : "Paste or drop text on the left"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="spec-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th scope="col" className="w-8"><span className="sr-only">Include</span></th>
                      <th scope="col" className="w-[6.5rem]">Posted</th>
                      <th scope="col">Role / Company</th>
                      <th scope="col">HR · Phone</th>
                      <th scope="col" className="w-8"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staged.map((row) => (
                      <tr key={row.key} className="row-lift row-lift-hover group">
                        <td className="pr-2">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) => {
                              const include = e.target.checked;
                              setStaged((prev) =>
                                prev.map((r) => (r.key === row.key ? { ...r, include } : r))
                              );
                            }}
                            aria-label={`Include ${row.role} at ${row.company}`}
                            className="size-4 accent-[var(--accent)] focus-ring"
                          />
                        </td>
                        <td className="font-mono text-xs whitespace-nowrap text-muted tabular-nums">
                          {formatDate(row.postedDate)}
                        </td>
                        <td>
                          <p className="font-medium text-ink">{row.role}</p>
                          <p className="text-muted">{row.company}</p>
                          {row.location && <p className="meta mt-1">{row.location}</p>}
                        </td>
                        <td>
                          {row.hrName ? (
                            <p className="text-ink">{row.hrName}</p>
                          ) : (
                            <p className="text-faint">No HR name</p>
                          )}
                          {row.hrPhone ? (
                            <a
                              href={`tel:${row.hrPhone.replace(/[^\d+]/g, "")}`}
                              className="font-mono text-xs text-accent-ink hover:underline focus-ring"
                            >
                              {row.hrPhone}
                            </a>
                          ) : (
                            <p className="font-mono text-xs text-faint">no phone</p>
                          )}
                        </td>
                        <td className="pr-0 text-right">
                          <button
                            onClick={() => setStaged((prev) => prev.filter((r) => r.key !== row.key))}
                            aria-label={`Remove ${row.role}`}
                            className="rounded p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-ring focus-visible:opacity-100"
                          >
                            <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={save}
                  disabled={saving || includedCount === 0}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
                >
                  {saving ? "Saving…" : `Add ${includedCount} to dashboard`}
                </button>
                <button
                  onClick={() => setStaged([])}
                  disabled={saving}
                  className="h-9 rounded-md border border-rule-strong bg-raised px-3 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40 focus-ring"
                >
                  Discard
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="ml-auto text-sm text-muted underline-offset-2 hover:text-ink hover:underline focus-ring"
                >
                  Back to dashboard
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
