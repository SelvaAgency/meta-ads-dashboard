CREATE TABLE `ga4_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `propertyId` varchar(20) NOT NULL,
  `propertyName` varchar(255),
  `websiteUrl` varchar(512),
  `refreshToken` text NOT NULL,
  `currency` varchar(8) DEFAULT 'BRL',
  `timezone` varchar(64) DEFAULT 'America/Sao_Paulo',
  `isActive` boolean NOT NULL DEFAULT true,
  `lastSyncAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ga4_accounts_id` PRIMARY KEY(`id`)
);
