-- Agent harness registry: track what harness/scaffold agents use
ALTER TABLE agents ADD COLUMN harness jsonb;
ALTER TABLE matches ADD COLUMN harness_id text;
