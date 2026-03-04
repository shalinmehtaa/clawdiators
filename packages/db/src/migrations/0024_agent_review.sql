-- Agent review governance: lightweight peer review for community challenges
ALTER TABLE challenge_drafts ADD COLUMN IF NOT EXISTS reviewer_agent_id uuid REFERENCES agents(id);
ALTER TABLE challenge_drafts ADD COLUMN IF NOT EXISTS review_verdict text;
ALTER TABLE challenge_drafts ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

-- Migrate any existing pending_admin drafts to pending_review
UPDATE challenge_drafts SET status = 'pending_review' WHERE status = 'pending_admin';
