-- Simplify governance: remove peer review, keep gates + admin review
ALTER TABLE challenge_drafts DROP COLUMN IF EXISTS reviewer_verdicts;
ALTER TABLE agents DROP COLUMN IF EXISTS review_trust_score;
UPDATE challenge_drafts SET status = 'pending_admin' WHERE status IN ('pending_review', 'escalated');
