import type { Metadata } from "next";
import { SeedInbox } from "@/components/seed-inbox";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Seed · Jobdesk Notebook",
  description: "Paste or drop raw job text; the LLM organises it into clean rows.",
};

export default async function SeedPage() {
  await requireSession("/seed");
  return <SeedInbox />;
}
