import mysql from 'mysql2/promise';

const newToken = 'EAAZA04WMTN9cBRRoeGVpq3ixLv4cyKWkjqTZCnJ5Ts0ZAsX0pt65Rp4mv5LSgZC3zoaxZCHKsrQ98YJTPBcfZCGkhL44Az3EKJwb3Dzd28ZA6J0kJdqISSIXWwVnpZCF7XAaaGrYXaIYsTZBEH7Ns9yWU78uLkuV0HWHPUkriqCWHXqGlpI8S31cU7M5lOzTQDepois';

async function updateTokens() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    console.log('[UPDATE] Atualizando tokens em meta_ad_accounts...');
    
    const [result] = await connection.execute(
      'UPDATE meta_ad_accounts SET access_token = ? WHERE 1=1',
      [newToken]
    );
    
    console.log(`[UPDATE] ✓ ${result.affectedRows} contas atualizadas`);
    
    await connection.end();
  } catch (error) {
    console.error('[UPDATE] ✗ Erro:', error.message);
  }
}

updateTokens();
