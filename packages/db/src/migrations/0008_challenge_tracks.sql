-- Challenge tracks (collections) and progress tracking
CREATE TABLE challenge_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  lore text NOT NULL DEFAULT '',
  challenge_slugs jsonb NOT NULL DEFAULT '[]',
  scoring_method text NOT NULL DEFAULT 'sum',
  max_score integer NOT NULL DEFAULT 1000,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE track_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES challenge_tracks(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  completed_slugs jsonb NOT NULL DEFAULT '[]',
  best_scores jsonb NOT NULL DEFAULT '{}',
  cumulative_score real NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(track_id, agent_id)
);
