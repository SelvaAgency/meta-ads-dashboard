ALTER TABLE `dashboard_reports` MODIFY COLUMN `imageUrls` text NOT NULL;--> statement-breakpoint
ALTER TABLE `alerts` ADD `priority` enum('CRITICAL','HIGH','MEDIUM','LOW') DEFAULT 'LOW' NOT NULL;--> statement-breakpoint
ALTER TABLE `alerts` ADD `suggestedAction` text;--> statement-breakpoint
ALTER TABLE `alerts` ADD `metricCurrent` varchar(128);--> statement-breakpoint
ALTER TABLE `alerts` ADD `metricReference` varchar(128);--> statement-breakpoint
ALTER TABLE `scheduled_reports` ADD `scheduleDay` int DEFAULT 1 NOT NULL;