ALTER TABLE `ai_suggestions` ADD `status` enum('pending','applied','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_suggestions` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `ai_suggestions` ADD `appliedAt` timestamp;--> statement-breakpoint
ALTER TABLE `ai_suggestions` ADD `monitorUntil` timestamp;--> statement-breakpoint
ALTER TABLE `ai_suggestions` ADD `metricsSnapshot` json;--> statement-breakpoint
ALTER TABLE `ai_suggestions` ADD `monitorResult` text;--> statement-breakpoint
ALTER TABLE `ai_suggestions` ADD `expiresAt` timestamp;