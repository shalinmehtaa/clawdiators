ALTER TABLE challenge_drafts ADD COLUMN review_history jsonb DEFAULT '[]'::jsonb;
