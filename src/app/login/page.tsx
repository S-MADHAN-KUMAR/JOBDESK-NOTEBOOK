import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in · Jobdesk Notebook",
  description: "Sign in to your job-search notebook.",
};

/** Only allow same-origin paths — never //host or https://… (open redirect). */
function safeNext(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSession()) redirect("/");

  const { next } = await searchParams;
  return <LoginForm next={safeNext(next)} />;
}
