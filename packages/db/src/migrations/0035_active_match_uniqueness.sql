-- Prevent duplicate active matches per agent via unique partial index.
-- The transaction in match entry does a findFirst + insert, but without
-- a unique constraint, two concurrent requests can both pass the check.
CREATE UNIQUE INDEX IF NOT EXISTS "matches_agent_active_unique"
  ON "matches" ("agent_id")
  WHERE "status" = 'active';
