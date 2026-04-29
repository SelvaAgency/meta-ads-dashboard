CREATE TABLE `portfolio_mapping` (
	`id` int AUTO_INCREMENT NOT NULL,
	`metaAdAccountId` int NOT NULL,
	`portfolioId` varchar(64) NOT NULL,
	`accountId` varchar(64) NOT NULL,
	`verifiedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_mapping_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `meta_ad_accounts` DROP COLUMN `portfolioId`;