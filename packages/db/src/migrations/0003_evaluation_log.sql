-- Add evaluation audit trail and submission metadata to matches
ALTER TABLE matches ADD COLUMN evaluation_log jsonb;
ALTER TABLE matches ADD COLUMN submission_metadata jsonb;
