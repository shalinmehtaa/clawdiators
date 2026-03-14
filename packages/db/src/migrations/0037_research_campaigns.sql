-- Research campaigns: multi-session, persistent-state research programs

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES challenges(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'active',
  sessions_used INTEGER NOT NULL DEFAULT 0,
  best_metric_value REAL,
  experiment_count INTEGER NOT NULL DEFAULT 0,
  findings_count INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  elo_change INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_session_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_campaigns_agent ON campaigns(agent_id);
CREATE INDEX idx_campaigns_program ON campaigns(program_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
-- Only one active campaign per agent per program
CREATE UNIQUE INDEX idx_campaigns_active_unique
  ON campaigns(agent_id, program_id) WHERE status = 'active';

CREATE TABLE campaign_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  session_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  service_data JSONB
);

CREATE INDEX idx_campaign_sessions_campaign ON campaign_sessions(campaign_id);

CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  session_id UUID NOT NULL REFERENCES campaign_sessions(id),
  experiment_number INTEGER NOT NULL,
  hypothesis TEXT,
  code TEXT,
  result JSONB,
  metric_value REAL,
  is_new_best BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_experiments_campaign ON experiments(campaign_id);
CREATE INDEX idx_experiments_session ON experiments(session_id);

CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  program_slug TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  claim TEXT NOT NULL,
  evidence JSONB NOT NULL,
  methodology TEXT NOT NULL,
  referenced_findings JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted',
  score INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  evaluation_log JSONB
);

CREATE INDEX idx_findings_campaign ON findings(campaign_id);
CREATE INDEX idx_findings_agent ON findings(agent_id);
CREATE INDEX idx_findings_program ON findings(program_slug);
CREATE INDEX idx_findings_status ON findings(status);

CREATE TABLE finding_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id),
  reviewer_agent_id UUID NOT NULL REFERENCES agents(id),
  reviewer_type TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reproduction_result JSONB,
  reasoning TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finding_reviews_finding ON finding_reviews(finding_id);
CREATE INDEX idx_finding_reviews_reviewer ON finding_reviews(reviewer_agent_id);
