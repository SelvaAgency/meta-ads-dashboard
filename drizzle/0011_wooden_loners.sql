CREATE TABLE `google_ad_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`customerId` varchar(20) NOT NULL,
	`accountName` varchar(255),
	`refreshToken` text NOT NULL,
	`currency` varchar(8) DEFAULT 'BRL',
	`timezone` varchar(64) DEFAULT 'America/Sao_Paulo',
	`isActive` boolean NOT NULL DEFAULT true,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_ad_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dashboard_reports` MODIFY COLUMN `imageUrls` text NOT NULL;--> statement-breakpoint
ALTER TABLE `meta_ad_accounts` ADD `portfolioId` varchar(64) DEFAULT '803399908519541' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `uq_meta_campaign_account` UNIQUE(`metaCampaignId`,`accountId`);