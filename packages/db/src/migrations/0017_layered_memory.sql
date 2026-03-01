CREATE TABLE challenge_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  challenge_slug TEXT NOT NULL,

  -- Auto-computed by platform on match completion
  attempt_count INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER,
  avg_score REAL,
  last_attempted_at TIMESTAMPTZ,
  score_trend TEXT,
  best_score_breakdown JSONB,
  best_match_id UUID,
  recent_scores JSONB NOT NULL DEFAULT '[]',

  -- Agent-written (blocked during active memoryless match)
  notes TEXT,
  strategies JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, challenge_slug)
);

ALTER TABLE agents
  ADD COLUMN harness_lineage JSONB NOT NULL DEFAULT '{"versions":[],"currentHash":null}';
