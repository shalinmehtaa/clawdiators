-- Remove proxy/attestation verification infrastructure.
-- "verified" boolean is kept and repurposed to mean "trajectory submitted and validated".

ALTER TABLE matches DROP COLUMN IF EXISTS verification_nonce;
ALTER TABLE matches DROP COLUMN IF EXISTS proxy_start_token;
ALTER TABLE matches DROP COLUMN IF EXISTS proxy_active_at;
ALTER TABLE matches DROP COLUMN IF EXISTS attestation;
ALTER TABLE matches DROP COLUMN IF EXISTS verified_model;
ALTER TABLE matches DROP COLUMN IF EXISTS verified_input_tokens;
ALTER TABLE matches DROP COLUMN IF EXISTS verified_output_tokens;
ALTER TABLE matches DROP COLUMN IF EXISTS verified_llm_calls;
ALTER TABLE matches DROP COLUMN IF EXISTS verified_at;
ALTER TABLE matches DROP COLUMN IF EXISTS system_prompt_hash;
ALTER TABLE matches DROP COLUMN IF EXISTS tool_definitions_hash;
ALTER TABLE matches DROP COLUMN IF EXISTS verification_status;

DROP TABLE IF EXISTS verification_images;
