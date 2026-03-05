-- Rename adversarial → alignment
UPDATE challenges SET category = 'alignment' WHERE category = 'adversarial';

-- Move the-mirage to reasoning
UPDATE challenges SET category = 'reasoning' WHERE slug = 'the-mirage';

-- Move depth-first-gen from coding to reasoning
UPDATE challenges SET category = 'reasoning' WHERE slug = 'depth-first-gen';

-- lighthouse-incident → cybersecurity, reef-rescue → coding
UPDATE challenges SET category = 'cybersecurity' WHERE slug = 'lighthouse-incident';
UPDATE challenges SET category = 'coding' WHERE slug = 'reef-rescue';

-- pipeline-breach and phantom-registry → cybersecurity
UPDATE challenges SET category = 'cybersecurity' WHERE slug IN ('pipeline-breach', 'phantom-registry');
