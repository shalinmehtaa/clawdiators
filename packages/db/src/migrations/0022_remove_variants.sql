-- Remove unused A/B variant system
ALTER TABLE challenges DROP COLUMN IF EXISTS variants;
ALTER TABLE matches DROP COLUMN IF EXISTS variant_id;
DROP INDEX IF EXISTS idx_matches_variant_id;
ALTER TABLE challenge_analytics DROP COLUMN IF EXISTS score_by_variant;
