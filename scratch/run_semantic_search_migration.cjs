const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// String de conexão com o banco de dados de produção do Supabase
const connectionString = 'postgresql://postgres:epdsAmnkCXtSqVCv@db.kvxboovgrrhhttaqinld.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function run() {
  try {
    console.log('Conectando ao banco de dados do Supabase de produção...');
    await client.connect();
    console.log('Conectado com sucesso!');

    const migrationPath = path.join(__dirname, '../supabase/migrations/20260629240000_add_semantic_search.sql');
    console.log(`Lendo migração de: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Aplicando migração no banco remoto...');
    await client.query(sql);
    console.log('Migração aplicada com sucesso!');

    // Forçar recarregamento do schema cache do PostgREST para o Supabase expor a nova RPC match_evolutions
    console.log('Recarregando schema cache do PostgREST...');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema cache recarregado com sucesso!');

  } catch (err) {
    console.error('Erro ao aplicar migração:', err);
  } finally {
    await client.end();
    console.log('Conexão encerrada.');
  }
}

run();
