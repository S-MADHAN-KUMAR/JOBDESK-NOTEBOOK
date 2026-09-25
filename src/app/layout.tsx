import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { hasGroqKey, DEFAULT_MODEL } from "@/lib/organize";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jobdesk Notebook",
  description: "Paste messy job posts, get a clean outreach list.",
};

function NavStatus() {
  const configured = hasGroqKey();
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  return (
    <span
      className="meta flex items-center gap-1.5"
      title={configured ? `Groq · ${model}` : "No GROQ_API_KEY — using the local parser"}
    >
      <span
        aria-hidden
        className={`inline-block size-1.5 rounded-full ${configured ? "bg-ok" : "bg-faint"}`}
      />
      {configured ? `Groq · ${model}` : "Local parser"}
    </span>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-rule-strong bg-raised/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex w-full max-w-[1440px] items-center gap-6 px-6 py-3.5">
            <Link href="/" className="flex items-center gap-2 focus-ring">
              <img src='logo.jpeg' className="w-6 h-6 border" />
                
              <span className="text-sm font-semibold tracking-tight">JOBDESK</span>
              <span className="meta hidden sm:inline">Notebook</span>
            </Link>

            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] hover:text-ink focus-ring"
              >
                Dashboard
              </Link>
              <Link
                href="/seed"
                className="rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] hover:text-ink focus-ring"
              >
                Seed
              </Link>
            </nav>

            <div className="ml-auto hidden items-center md:flex">
              <NavStatus />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-rule">
          <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-5">
            <span className="meta">Jobdesk Notebook</span>
            <span className="meta">Single user · local-first</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
