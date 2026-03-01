-- Migration: 0013_harness_fingerprint_registry.sql
-- Community registry mapping system_prompt_hash → harness name

CREATE TABLE harness_registry (
  system_prompt_hash      text PRIMARY KEY,
  harness_name            text NOT NULL,
  description             text,
  registered_by_agent_id  uuid NOT NULL REFERENCES agents(id),
  registered_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_harness_registry_agent ON harness_registry (registered_by_agent_id);
