ALTER TABLE `alerts` ADD `emailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `anomalies` ADD `emailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `campaign_metrics` ADD CONSTRAINT `uq_campaign_date` UNIQUE(`campaignId`,`date`);