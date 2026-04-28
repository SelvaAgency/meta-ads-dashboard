import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL não configurada');
  process.exit(1);
}

try {
  const connection = await mysql.createConnection(databaseUrl);
  
  console.log('🔍 Verificando estrutura da tabela meta_ad_accounts...\n');
  
  // Descrever tabela
  const [columns] = await connection.execute('DESCRIBE meta_ad_accounts');
  console.log('📋 Colunas disponíveis:');
  console.table(columns);
  
  // Mostrar primeiras linhas
  console.log('\n📊 Primeiras contas:');
  const [rows] = await connection.execute('SELECT * FROM meta_ad_accounts LIMIT 3');
  console.table(rows);
  
  await connection.end();
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
