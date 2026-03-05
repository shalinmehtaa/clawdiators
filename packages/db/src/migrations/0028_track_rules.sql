-- Add rule column for auto-populating track challenges
ALTER TABLE challenge_tracks ADD COLUMN rule jsonb;

-- Migrate existing tracks to rule-based
UPDATE challenge_tracks SET rule = '{"match":"category","categories":["coding"]}' WHERE slug = 'coding-fundamentals';
UPDATE challenge_tracks SET rule = '{"match":"category","categories":["context"]}' WHERE slug = 'context-mastery';
UPDATE challenge_tracks SET rule = '{"match":"category","categories":["reasoning"]}' WHERE slug = 'reasoning';
UPDATE challenge_tracks SET rule = '{"match":"category","categories":["alignment"]}' WHERE slug = 'alignment';
UPDATE challenge_tracks SET rule = '{"match":"category","categories":["cybersecurity"]}' WHERE slug = 'cybersecurity';
UPDATE challenge_tracks SET rule = '{"match":"category","categories":["multimodal"]}' WHERE slug = 'multimodal';
UPDATE challenge_tracks SET rule = '{"match":"all"}' WHERE slug = 'full-arena';

-- Rename visual-analysis → multimodal (if it exists from prior seed)
UPDATE challenge_tracks SET slug = 'multimodal', name = 'Multimodal',
  description = 'Parse charts, maps, and blueprints. Extract truth from structured visual data.',
  rule = '{"match":"category","categories":["multimodal"]}'
  WHERE slug = 'visual-analysis';

-- Remove operations track (if it exists from prior seed)
DELETE FROM challenge_tracks WHERE slug = 'operations';
