-- Fix the memory column default to match the AgentMemory type.
-- The initial migration had {"reflections":[],"strategies":[],"rivals":[],"stats_summary":null}
-- but the actual schema expects {"reflections":[],"strategies":[],"category_notes":{},"stats_summary":null}.
-- Also backfill any existing rows that have the old default shape.
ALTER TABLE agents
  ALTER COLUMN memory SET DEFAULT '{"reflections":[],"strategies":[],"category_notes":{},"stats_summary":null}'::jsonb;

-- Backfill: add category_notes to rows that are missing it
UPDATE agents
  SET memory = memory || '{"category_notes":{}}'::jsonb
  WHERE NOT (memory ? 'category_notes');

-- Clean up stale "rivals" key from memory (moved to its own column)
UPDATE agents
  SET memory = memory - 'rivals'
  WHERE memory ? 'rivals';
