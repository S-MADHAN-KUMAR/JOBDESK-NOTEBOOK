import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings · Jobdesk Notebook",
  description: "Upload your resume and links for WhatsApp outreach messages.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSession("/settings");
  return <SettingsForm />;
}
