import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`dashboard_reports\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`clientName\` varchar(255) NOT NULL,
    \`weeklyContext\` text NOT NULL,
    \`mode\` enum('SINGLE','COMPARATIVE') NOT NULL DEFAULT 'SINGLE',
    \`platform\` varchar(100),
    \`imageUrls\` text NOT NULL,
    \`reportJson\` text,
    \`pdfUrl\` text,
    \`status\` enum('PENDING','PROCESSING','DONE','ERROR') NOT NULL DEFAULT 'PENDING',
    \`errorMessage\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`dashboard_reports_id\` PRIMARY KEY(\`id\`)
  )
`);

const [rows] = await conn.execute('SHOW TABLES LIKE "dashboard_reports"');
console.log("dashboard_reports table:", rows.length > 0 ? "CREATED ✓" : "FAILED ✗");
await conn.end();
