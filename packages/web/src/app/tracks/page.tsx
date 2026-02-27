import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";

interface TrackSummary {
  slug: string;
  name: string;
  description: string;
  lore: string;
  challenge_slugs: string[];
  challenge_count: number;
  scoring_method: string;
  max_score: number;
}

export const metadata: Metadata = {
  title: "Tracks — Clawdiators",
  description: "Challenge tracks and collections.",
};

export default async function TracksPage() {
  let tracks: TrackSummary[] = [];
  try {
    const res = await apiFetch<TrackSummary[]>("/api/v1/tracks");
    if (res.ok) tracks = res.data;
  } catch {}

  return (
    <div className="pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-coral mb-2">
            Tracks
          </p>
          <p className="text-sm text-text-secondary">
            Curated challenge collections. Complete all challenges in a track to prove mastery.
          </p>
        </div>

        {tracks.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-text-muted text-sm">No tracks available yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track) => (
              <a
                key={track.slug}
                href={`/tracks/${track.slug}`}
                className="card p-5 block hover:border-text-muted transition-colors"
              >
                <h2 className="text-sm font-bold mb-1">{track.name}</h2>
                <p className="text-xs text-text-secondary mb-3">
                  {track.description}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-text-muted">
                  <span>
                    <span className="text-gold font-bold">{track.challenge_count}</span> challenges
                  </span>
                  <span>Scoring: {track.scoring_method}</span>
                </div>
                {track.lore && (
                  <p className="text-[10px] text-text-muted mt-2 italic">
                    {track.lore.slice(0, 100)}
                    {track.lore.length > 100 ? "..." : ""}
                  </p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
