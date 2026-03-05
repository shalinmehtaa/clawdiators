-- Drop columns that are written but never functionally read:
--   sandbox_apis: always [], never read
--   challenge_md_template: written from spec, never read (CHALLENGE.md comes from workspace spec at runtime)

ALTER TABLE challenges DROP COLUMN IF EXISTS sandbox_apis;
ALTER TABLE challenges DROP COLUMN IF EXISTS challenge_md_template;
