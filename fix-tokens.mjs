import mysql from 'mysql2/promise';

const newToken = 'EAAZA04WMTN9cBRRoeGVpq3ixLv4cyKWkjqTZCnJ5Ts0ZAsX0pt65Rp4mv5LSgZC3zoaxZCHKsrQ98YJTPBcfZCGkhL44Az3EKJwb3Dzd28ZA6J0kJdqISSIXWwVnpZCF7XAaaGrYXaIYsTZBEH7Ns9yWU78uLkuV0HWHPUkriqCWHXqGlpI8S31cU7M5lOzTQ';

async function fixTokens() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    // Atualizar tokens (coluna correta: accessToken)
    console.log('[UPDATE] Atualizando tokens em meta_ad_accounts...');
    const [result] = await connection.execute(
      'UPDATE meta_ad_accounts SET accessToken = ?',
      [newToken]
    );
    console.log(`✓ ${result.affectedRows} contas atualizadas`);
    
    // Verificar
    console.log('\n[VERIFY] Contas atualizadas:');
    const [rows] = await connection.execute(
      'SELECT id, accountName, SUBSTRING(accessToken, 1, 30) as token_prefix FROM meta_ad_accounts'
    );
    console.log(`Total: ${rows.length} contas\n`);
    for (const row of rows) {
      console.log(`  - ${row.accountName}: ${row.token_prefix}...`);
    }
    
    await connection.end();
  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

fixTokens();
