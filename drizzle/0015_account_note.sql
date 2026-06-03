-- Add accountNote field to meta_ad_accounts for manual account annotations.
ALTER TABLE meta_ad_accounts ADD COLUMN accountNote TEXT NULL;
