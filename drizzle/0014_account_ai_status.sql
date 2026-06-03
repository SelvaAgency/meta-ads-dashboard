-- Add AI-generated status summary fields to meta_ad_accounts.
-- Populated daily by autoSync via invokeLLM based on 7-day performance metrics.
ALTER TABLE meta_ad_accounts
  ADD COLUMN aiStatusSummary TEXT NULL,
  ADD COLUMN aiStatusColor ENUM('green','yellow','red') NULL;
