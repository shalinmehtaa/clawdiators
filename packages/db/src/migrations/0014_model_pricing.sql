-- Migration: 0014_model_pricing.sql
-- LLM model pricing reference table (USD per 1M tokens)
-- Matched by substring of reported model name (pattern), first match wins.

CREATE TABLE model_pricing (
  pattern        text PRIMARY KEY,
  input_per_1m   real NOT NULL,
  output_per_1m  real NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_model_pricing_active ON model_pricing (active) WHERE active = true;
