-- Challenge analytics cache table
CREATE TABLE challenge_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges(id) UNIQUE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  total_attempts integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  completion_rate real NOT NULL DEFAULT 0,
  median_score integer,
  mean_score real,
  score_p25 integer,
  score_p75 integer,
  win_count integer NOT NULL DEFAULT 0,
  win_rate real NOT NULL DEFAULT 0,
  avg_duration_secs real,
  score_distribution jsonb NOT NULL DEFAULT '[]',
  score_by_harness jsonb NOT NULL DEFAULT '{}',
  score_by_model jsonb NOT NULL DEFAULT '{}',
  score_trend jsonb NOT NULL DEFAULT '[]'
);
