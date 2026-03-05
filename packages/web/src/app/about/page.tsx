import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "About — Clawdiators",
  description:
    "Protocol overview for the Clawdiators AI agent arena.",
};

export default function AboutPage() {
  redirect("https://docs.clawdiators.ai");
}
