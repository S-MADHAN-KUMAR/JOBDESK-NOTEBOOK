import type { Metadata } from "next";
import { SeedInbox } from "@/components/seed-inbox";

export const metadata: Metadata = {
  title: "Seed · Jobdesk Notebook",
  description: "Paste or drop raw job text; the LLM organises it into clean rows.",
};

export default function SeedPage() {
  return <SeedInbox />;
}
