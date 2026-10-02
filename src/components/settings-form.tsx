"use client";

import { useEffect, useState } from "react";

const inputCls =
  "w-full rounded-lg border border-rule-strong bg-raised px-3 py-2 text-sm text-ink placeholder:text-faint focus-ring";

const labelCls = "meta block mb-1.5";

export function SettingsForm() {
  const [resumeContext, setResumeContext] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(async (r) => {
        const text = await r.text();
        if (!text) throw new Error("Empty response");
        return JSON.parse(text);
      })
      .then((data) => {
        const p = data.profile;
        if (p) {
          setResumeContext(p.resumeText ?? "");
          setPortfolioUrl(p.portfolioUrl ?? "");
          setLinkedinUrl(p.linkedinUrl ?? "");
          setGithubUrl(p.githubUrl ?? "");
        }
        setLoaded(true);
      })
      .catch(() => {
        setError("Could not load your profile.");
        setLoaded(true);
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: resumeContext || null,
          portfolioUrl: portfolioUrl || null,
          linkedinUrl: linkedinUrl || null,
          githubUrl: githubUrl || null,
        }),
      });
      const text = await res.text();
      if (!text) throw new Error("Empty response from server");
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage("Saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-16">
        <p className="meta">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 sm:py-10">
      <p className="meta">Settings</p>
      <h1 className="mt-2 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
        Your outreach profile
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Paste your resume context and links. When you tap the WhatsApp icon on any job,
        Groq writes a personalised message using this profile and the job details.
      </p>

      <form onSubmit={save} className="mt-8 space-y-6 border-t border-rule pt-8">
        {/* Resume context */}
        <div>
          <label htmlFor="resumeContext" className={labelCls}>
            Resume context
          </label>
          <textarea
            id="resumeContext"
            value={resumeContext}
            onChange={(e) => setResumeContext(e.target.value)}
            placeholder="Paste your resume summary — skills, experience, education, achievements…"
            rows={12}
            className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
          />
          <p className="meta mt-1.5">
            Used by Groq to write your outreach messages.
          </p>
        </div>

        {/* Links */}
        <fieldset className="space-y-4">
          <legend className="meta mb-3">Links</legend>

          <div>
            <label htmlFor="portfolioUrl" className={labelCls}>
              Portfolio URL
            </label>
            <input
              id="portfolioUrl"
              type="url"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="https://yourportfolio.com"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="linkedinUrl" className={labelCls}>
              LinkedIn URL
            </label>
            <input
              id="linkedinUrl"
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourprofile"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="githubUrl" className={labelCls}>
              GitHub URL
            </label>
            <input
              id="githubUrl"
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/yourusername"
              className={inputCls}
            />
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-tint-blush px-3 py-2 text-sm text-tint-blush-ink">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg border border-ok/25 bg-tint-sage px-3 py-2 text-sm text-tint-sage-ink">
            {message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-ink disabled:opacity-40 focus-ring"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
          <p className="meta">Stored in your database</p>
        </div>
      </form>
    </div>
  );
}
