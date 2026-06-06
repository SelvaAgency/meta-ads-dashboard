CREATE TABLE `daily_briefings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `date` varchar(10) NOT NULL,
  `content` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `daily_briefings_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_user_date_briefing` UNIQUE(`userId`, `date`)
);
