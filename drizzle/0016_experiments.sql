CREATE TABLE `experiments` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `accountId` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `centralQuestion` TEXT,
  `hypothesis` TEXT,
  `startDate` VARCHAR(10) NOT NULL,
  `endDate` VARCHAR(10) NOT NULL,
  `status` ENUM('planned','active','completed','paused') NOT NULL DEFAULT 'planned',
  `dailyBudget` DECIMAL(10,2),
  `totalBudget` DECIMAL(10,2),
  `channels` JSON,
  `campaignIds` JSON,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `experiment_kpis` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `experimentId` INT NOT NULL,
  `metric` VARCHAR(64) NOT NULL,
  `unit` VARCHAR(8) NOT NULL DEFAULT '#',
  `minSignal` DECIMAL(10,4),
  `goal` DECIMAL(10,4) NOT NULL
);

CREATE TABLE `experiment_checkpoints` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `experimentId` INT NOT NULL,
  `date` VARCHAR(10) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `qualitativeNote` TEXT,
  `snapshotData` JSON,
  `status` ENUM('pending','active','done') NOT NULL DEFAULT 'pending'
);

CREATE TABLE `experiment_decisions` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `experimentId` INT NOT NULL,
  `scenario` VARCHAR(255) NOT NULL,
  `reading` TEXT,
  `nextStep` TEXT,
  `isCurrent` BOOLEAN NOT NULL DEFAULT false
);
