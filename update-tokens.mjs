import mysql from 'mysql2/promise';

const newToken = 'EAAZA04WMTN9cBRWQDB2ngBFTgjigf2hyQvwsq8CKPlNT2vssZAaYZBB9TPvZCUwlmrP3jlhgF7C9pdN4e6o7nRedI9XWBoHqc9JPSCd6pwtnQqZAm59DwZCoTwZAoSYqqrspNqtKVzZB2oKo5G3nLqLvrGpGPUrGy7hgmFoPjAH3aoQhgHFxwe8r43FUMi98xqcgpTg0qUiMI0Sbki2bUBIByKlXDqVGc3fIhA3ldc0mZAlZAFaF43uGhAszemMZBWrDLQIrJZBtwWFt2Hcp1j5t2Oa2ppWQ';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL não configurada');
  process.exit(1);
}

try {
  const connection = await mysql.createConnection(databaseUrl);
  
  console.log('🔄 Atualizando tokens...');
  const [result] = await connection.execute(
    'UPDATE meta_ad_accounts SET access_token = ? WHERE 1=1',
    [newToken]
  );
  
  console.log(`✅ ${result.affectedRows} contas atualizadas`);
  
  // Verificar
  const [rows] = await connection.execute(
    'SELECT id, account_id, SUBSTR(access_token, 1, 20) as token_prefix, LENGTH(access_token) as token_len FROM meta_ad_accounts LIMIT 5'
  );
  
  console.log('\n📊 Verificação:');
  console.table(rows);
  
  await connection.end();
  console.log('\n✅ Concluído');
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
