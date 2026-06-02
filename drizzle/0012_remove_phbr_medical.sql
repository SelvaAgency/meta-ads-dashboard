-- Remove PHBR Medical account (Meta accountId 746370099294331) and all related data.
-- Execution order respects FK dependencies:
--   campaign_metrics → campaigns → meta_ad_accounts
--   anomalies, alerts, ai_suggestions, scheduled_reports → meta_ad_accounts

-- Step 1: delete campaign_metrics rows belonging to PHBR Medical campaigns
DELETE cm
FROM campaign_metrics cm
INNER JOIN campaigns c ON c.id = cm.campaignId
INNER JOIN meta_ad_accounts a ON a.id = c.accountId
WHERE a.accountId = '746370099294331';

-- Step 2: delete campaigns
DELETE c
FROM campaigns c
INNER JOIN meta_ad_accounts a ON a.id = c.accountId
WHERE a.accountId = '746370099294331';

-- Step 3: delete anomalies
DELETE an
FROM anomalies an
INNER JOIN meta_ad_accounts a ON a.id = an.accountId
WHERE a.accountId = '746370099294331';

-- Step 4: delete alerts
DELETE al
FROM alerts al
INNER JOIN meta_ad_accounts a ON a.id = al.accountId
WHERE a.accountId = '746370099294331';

-- Step 5: delete AI suggestions
DELETE s
FROM ai_suggestions s
INNER JOIN meta_ad_accounts a ON a.id = s.accountId
WHERE a.accountId = '746370099294331';

-- Step 6: delete scheduled reports
DELETE sr
FROM scheduled_reports sr
INNER JOIN meta_ad_accounts a ON a.id = sr.accountId
WHERE a.accountId = '746370099294331';

-- Step 7: delete the account itself
DELETE FROM meta_ad_accounts
WHERE accountId = '746370099294331';
