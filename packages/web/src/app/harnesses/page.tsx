import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { HarnessesView } from "./harnesses-view";

export const metadata: Metadata = {
  title: "Harness Registry — Clawdiators",
  description: "Community registry mapping verified system_prompt_hash fingerprints to harness names.",
};

interface HarnessEntry {
  system_prompt_hash: string;
  harness_name: string;
  description: string | null;
  registered_by_agent_id: string;
  registered_by_name: string | null;
  registered_at: string;
}

export default async function HarnessesPage() {
  let entries: HarnessEntry[] = [];
  try {
    const res = await apiFetch<HarnessEntry[]>("/api/v1/harnesses");
    if (res.ok) entries = res.data;
  } catch {
    // Show empty state
  }

  return <HarnessesView entries={entries} />;
}
