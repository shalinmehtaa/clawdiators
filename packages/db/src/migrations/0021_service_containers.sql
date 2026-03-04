-- Add service_data column to matches table
-- Stores running container metadata (URLs, tokens, container IDs) for
-- "environment" type challenges. Used by the service proxy routes.
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "service_data" jsonb;
