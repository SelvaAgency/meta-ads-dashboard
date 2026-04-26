import mysql from 'mysql2/promise';

const newToken = 'EAAZA04WMTN9cBRRoeGVpq3ixLv4cyKWkjqTZCnJ5Ts0ZAsX0pt65Rp4mv5LSgZC3zoaxZCHKsrQ98YJTPBcfZCGkhL44Az3EKJwb3Dzd28ZA6J0kJdqISSIXWwVnpZCF7XAaaGrYXaIYsTZBEH7Ns9yWU78uLkuV0HWHPUkriqCWHXqGlpI8S31cU7M5lOzTQ';

async function updateTokens() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    console.log('[UPDATE] Atualizando tokens em meta_ad_accounts...');
    
    // Atualizar tokens (sem WHERE para atualizar TODOS)
    const [result] = await connection.execute(
      'UPDATE meta_ad_accounts SET access_token = ?',
      [newToken]
    );
    
    console.log(`[UPDATE] ✓ ${result.affectedRows} contas atualizadas`);
    
    // Verificar
    const [rows] = await connection.execute(
      'SELECT id, name, SUBSTRING(access_token, 1, 30) as token_prefix FROM meta_ad_accounts'
    );
    
    console.log('\n[VERIFY] Contas atualizadas:');
    for (const row of rows) {
      console.log(`  - ${row.name} (ID: ${row.id})`);
      console.log(`    Token: ${row.token_prefix}...`);
    }
    
    await connection.end();
  } catch (error) {
    console.error('[ERROR]', error.message);
  }
}

updateTokens();
