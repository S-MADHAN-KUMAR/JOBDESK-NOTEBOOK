"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/lib/jobs";

type ProfileData = {
  resumeText: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
};

type Props = {
  job: Job;
  onClose: () => void;
};

function whatsappHref(phone: string, message: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  const num = digits.startsWith("+") ? digits.slice(1) : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export function WhatsAppModal({ job, onClose }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => setProfile(data.profile))
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setMessage("");
    setGenerated(false);

    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: job.role,
          company: job.company,
          location: job.location,
          hrName: job.hrName,
          notes: job.notes,
          resumeText: profile?.resumeText ?? null,
          portfolioUrl: profile?.portfolioUrl ?? null,
          linkedinUrl: profile?.linkedinUrl ?? null,
          githubUrl: profile?.githubUrl ?? null,
          mode: "generate",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessage(data.message);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate message.");
    } finally {
      setGenerating(false);
    }
  }

  async function enhance() {
    if (!message.trim()) return;
    setEnhancing(true);
    setError(null);

    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: job.role,
          company: job.company,
          location: job.location,
          hrName: job.hrName,
          notes: job.notes,
          resumeText: profile?.resumeText ?? null,
          portfolioUrl: profile?.portfolioUrl ?? null,
          linkedinUrl: profile?.linkedinUrl ?? null,
          githubUrl: profile?.githubUrl ?? null,
          existingMessage: message,
          mode: "enhance",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enhance message.");
    } finally {
      setEnhancing(false);
    }
  }

  function sendToWhatsApp() {
    if (!job.hrPhone) return;
    const href = whatsappHref(job.hrPhone, message);
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const canSend = message.trim().length > 0 && job.hrPhone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`WhatsApp message for ${job.role} at ${job.company}`}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-raised shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="meta">WhatsApp outreach</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-ink">
              {job.role} · {job.company}
            </h2>
            {job.hrName && (
              <p className="meta mt-0.5">
                To: {job.hrName}
                {job.hrPhone ? ` · ${job.hrPhone}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-tint-sand hover:text-ink focus-ring"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {!generated && !generating && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-tint-sage">
                <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-ok" fill="currentColor">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
                </svg>
              </div>
              <p className="mt-4 text-sm font-medium text-ink">
                Generate a personalised WhatsApp message
              </p>
              <p className="meta mt-2 max-w-[40ch]">
                Groq will write a message using your resume, links, and this job&apos;s details.
              </p>
              <button
                onClick={generate}
                disabled={generating}
                className="mt-5 h-10 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-ink disabled:opacity-40 focus-ring"
              >
                Generate message
              </button>
              {error && (
                <p role="alert" className="mt-3 max-w-[46ch] rounded-lg border border-red-200 bg-tint-blush px-3 py-2 text-sm text-tint-blush-ink">
                  {error}
                </p>
              )}
              {!profile?.resumeText && (
                <p className="meta mt-3 text-warn">
                  No resume text found — add it in Settings for better messages.
                </p>
              )}
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="size-8 animate-spin rounded-full border-2 border-rule-strong border-t-accent" />
              <p className="meta mt-4">Writing your message…</p>
            </div>
          )}

          {generated && (
            <div className="space-y-4">
              <label htmlFor="wa-message" className="meta block">
                Message
              </label>
              <textarea
                id="wa-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={12}
                className="w-full resize-y rounded-lg border border-rule-strong bg-raised p-4 text-sm leading-relaxed text-ink focus-ring"
                placeholder="Your message will appear here…"
              />

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-tint-blush px-3 py-2 text-sm text-tint-blush-ink">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={sendToWhatsApp}
                  disabled={!canSend}
                  className="h-10 rounded-lg bg-ok px-4 text-sm font-medium text-white transition-colors hover:bg-[#036b3a] disabled:opacity-40 focus-ring"
                >
                  Send via WhatsApp
                </button>
                <button
                  onClick={enhance}
                  disabled={enhancing || !message.trim()}
                  className="h-10 rounded-lg border border-rule-strong bg-raised px-4 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40 focus-ring"
                >
                  {enhancing ? "Enhancing…" : "Enhance with Groq"}
                </button>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="h-10 rounded-lg border border-rule-strong bg-raised px-4 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40 focus-ring"
                >
                  Regenerate
                </button>
                {!job.hrPhone && (
                  <p className="meta ml-auto text-warn">
                    No phone number on this job
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
