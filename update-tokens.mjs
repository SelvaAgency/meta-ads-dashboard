import { drizzle } from 'drizzle-orm/mysql2/promise';
import mysql from 'mysql2/promise';
import * as schema from './drizzle/schema.ts';

const newToken = 'EAAZA04WMTN9cBRRoeGVpq3ixLv4cyKWkjqTZCnJ5Ts0ZAsX0pt65Rp4mv5LSgZC3zoaxZCHKsrQ98YJTPBcfZCGkhL44Az3EKJwb3Dzd28ZA6J0kJdqISSIXWwVnpZCF7XAaaGrYXaIYsTZBEH7Ns9yWU78uLkuV0HWHPUkriqCWHXqGlpI8S31cU7M5lOzTQDepois';

async function updateTokens() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const db = drizzle(connection, { schema });
    
    console.log('[UPDATE] Atualizando tokens em meta_ad_accounts...');
    
    const result = await connection.execute(
      'UPDATE meta_ad_accounts SET access_token = ? WHERE 1=1',
      [newToken]
    );
    
    console.log(`[UPDATE] ✓ ${result[0].affectedRows} contas atualizadas`);
    
    await connection.end();
  } catch (error) {
    console.error('[UPDATE] ✗ Erro:', error.message);
  }
}

updateTokens();
