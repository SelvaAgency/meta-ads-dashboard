CREATE TABLE IF NOT EXISTS `progress_email_log` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `date` varchar(10) NOT NULL,
  `sentAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `recipients` text,
  `subject` varchar(255),
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP
);
