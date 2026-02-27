-- Difficulty auto-calibration columns
ALTER TABLE challenges ADD COLUMN calibrated_difficulty text;
ALTER TABLE challenges ADD COLUMN calibration_data jsonb;
ALTER TABLE challenges ADD COLUMN calibration_sample_size integer NOT NULL DEFAULT 0;
