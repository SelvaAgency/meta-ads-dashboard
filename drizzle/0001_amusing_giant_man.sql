CREATE TABLE `ai_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`campaignId` int,
	`category` enum('BUDGET','TARGETING','CREATIVE','BIDDING','SCHEDULE','AUDIENCE','GENERAL') NOT NULL,
	`priority` enum('LOW','MEDIUM','HIGH') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`expectedImpact` text,
	`actionItems` json,
	`isApplied` boolean NOT NULL DEFAULT false,
	`isDismissed` boolean NOT NULL DEFAULT false,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int NOT NULL,
	`anomalyId` int,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('ANOMALY','REPORT','SYNC_ERROR','BUDGET_WARNING') NOT NULL,
	`severity` enum('INFO','WARNING','CRITICAL') NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anomalies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`campaignId` int,
	`type` enum('ROAS_DROP','CPA_SPIKE','CTR_DROP','SPEND_SPIKE','DELIVERY_CHANGE','FREQUENCY_HIGH','CONVERSION_DROP','BUDGET_EXHAUSTED') NOT NULL,
	`severity` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`metricName` varchar(64),
	`currentValue` decimal(12,4),
	`previousValue` decimal(12,4),
	`changePercent` decimal(8,2),
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`isRead` boolean NOT NULL DEFAULT false,
	`isResolved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anomalies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`accountId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`impressions` bigint DEFAULT 0,
	`clicks` bigint DEFAULT 0,
	`spend` decimal(12,2) DEFAULT '0',
	`conversions` decimal(12,4) DEFAULT '0',
	`conversionValue` decimal(12,2) DEFAULT '0',
	`reach` bigint DEFAULT 0,
	`frequency` decimal(8,4) DEFAULT '0',
	`ctr` decimal(8,4) DEFAULT '0',
	`cpc` decimal(10,4) DEFAULT '0',
	`cpm` decimal(10,4) DEFAULT '0',
	`cpa` decimal(12,4) DEFAULT '0',
	`roas` decimal(10,4) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`metaCampaignId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('ACTIVE','PAUSED','DELETED','ARCHIVED') DEFAULT 'ACTIVE',
	`objective` varchar(64),
	`dailyBudget` decimal(12,2),
	`lifetimeBudget` decimal(12,2),
	`startTime` timestamp,
	`stopTime` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meta_ad_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` varchar(64) NOT NULL,
	`accountName` varchar(255),
	`accessToken` text NOT NULL,
	`tokenExpiresAt` timestamp,
	`currency` varchar(8),
	`timezone` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meta_ad_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int NOT NULL,
	`frequency` enum('DAILY','WEEKLY') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`lastReportContent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_reports_id` PRIMARY KEY(`id`)
);
