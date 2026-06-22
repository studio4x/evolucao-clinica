const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const projectId = process.env.SUPABASE_PROJECT_ID;

if (!dbPassword || !projectId) {
  console.error("Erro: SUPABASE_DB_PASSWORD ou SUPABASE_PROJECT_ID não encontrados");
  process.exit(1);
}

const connectionString = `postgresql://postgres:${dbPassword}@db.${projectId}.supabase.co:6543/postgres`;

console.log("Conectando ao banco de dados Supabase para criar a tabela de relatórios...");
const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Conectado!");

    const migrationPath = path.join(__dirname, '../supabase/migrations/20260622220000_create_patient_reports_table.sql');
    console.log(`Lendo migração de: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log("Executando SQL...");
    await client.query(sql);
    console.log("Migração aplicada com sucesso (Tabela patient_reports criada)!");
  } catch (err) {
    console.error("Erro ao aplicar migração:", err);
  } finally {
    await client.end();
    console.log("Desconectado.");
  }
}

run();
