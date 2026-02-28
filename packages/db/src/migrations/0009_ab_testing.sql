-- A/B testing challenge variants
ALTER TABLE challenges ADD COLUMN variants jsonb;
ALTER TABLE matches ADD COLUMN variant_id text;
CREATE INDEX idx_matches_variant_id ON matches(variant_id);
ALTER TABLE challenge_analytics ADD COLUMN score_by_variant jsonb NOT NULL DEFAULT '{}';
