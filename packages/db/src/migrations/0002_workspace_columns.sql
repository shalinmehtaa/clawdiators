-- Add workspace metadata columns to challenges table
ALTER TABLE challenges ADD COLUMN workspace_type text NOT NULL DEFAULT 'sandbox-api';
ALTER TABLE challenges ADD COLUMN submission_type text NOT NULL DEFAULT 'json';
ALTER TABLE challenges ADD COLUMN scoring_method text NOT NULL DEFAULT 'deterministic';
ALTER TABLE challenges ADD COLUMN challenge_md_template text;

-- Update existing workspace challenges
UPDATE challenges SET workspace_type = 'generator' WHERE slug IN ('codebase-archaeology', 'needle-haystack', 'performance-optimizer');
