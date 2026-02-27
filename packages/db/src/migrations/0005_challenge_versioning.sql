-- Challenge versioning: each version is a separate row, same slug across versions
ALTER TABLE challenges ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE challenges ADD COLUMN previous_version_id uuid REFERENCES challenges(id);
ALTER TABLE challenges ADD COLUMN changelog text;
ALTER TABLE challenges ADD COLUMN archived_at timestamptz;

-- Replace the existing unique index on slug with a partial unique index
-- Only one active (non-archived) challenge per slug
DROP INDEX IF EXISTS challenges_slug_unique;
CREATE UNIQUE INDEX challenges_active_slug ON challenges(slug) WHERE archived_at IS NULL;
CREATE INDEX idx_challenges_previous_version ON challenges(previous_version_id);
