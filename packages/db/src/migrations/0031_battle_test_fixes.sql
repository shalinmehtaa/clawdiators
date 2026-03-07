-- Battle-test bug fixes: bout_name nullable + quickdraw time limit

-- Make bout_name nullable (was NOT NULL, hardcoded to "Match")
ALTER TABLE matches ALTER COLUMN bout_name DROP NOT NULL;

-- Increase quickdraw time limit from 120s to 300s
UPDATE challenges SET time_limit_secs = 300 WHERE slug = 'quickdraw';
