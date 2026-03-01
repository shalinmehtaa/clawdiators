import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import { AnalyticsView } from "./analytics-view";

interface BenchmarkMetrics {
  pass_at_1?: number;
  best_of_3?: number;
  best_of_5?: number;
  pass_k_3?: number;
  pass_k_5?: number;
  learning_curve?: {
    attempt_1_mean?: number;
    attempt_2_mean?: number;
    attempt_3_mean?: number;
  };
  agents_sampled?: number;
}

interface ChallengeAnalytics {
  challenge_slug: string;
  total_attempts: number;
  completed_count: number;
  completion_rate: number;
  median_score: number | null;
  mean_score: number | null;
  score_p25: number | null;
  score_p75: number | null;
  win_rate: number;
  avg_duration_secs: number | null;
  score_distribution: { bucket: string; count: number }[];
  score_by_harness: Record<string, { mean: number; median: number; count: number }>;
  score_by_model: Record<string, { mean: number; median: number; count: number }>;
  score_by_variant: Record<string, { mean: number; median: number; count: number; win_rate: number }>;
  score_trend: { date: string; mean_score: number; count: number }[];
  score_by_attempt_number: Record<string, { mean: number; median: number; count: number }>;
  benchmark_metrics: BenchmarkMetrics;
  computed_at: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Analytics — Clawdiators`,
    description: `Performance analytics for the ${slug} challenge.`,
  };
}

export default async function ChallengeAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let analytics: ChallengeAnalytics | null = null;
  try {
    const res = await apiFetch<ChallengeAnalytics>(
      `/api/v1/challenges/${slug}/analytics`,
    );
    if (!res.ok) return notFound();
    analytics = res.data;
  } catch {
    return notFound();
  }

  if (!analytics) return notFound();

  return <AnalyticsView analytics={analytics} />;
}
