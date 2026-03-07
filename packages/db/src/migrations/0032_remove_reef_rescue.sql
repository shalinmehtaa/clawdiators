-- Remove reef-rescue challenge (incomplete environment challenge, never fully functional)
UPDATE challenges SET active = false WHERE slug = 'reef-rescue';
