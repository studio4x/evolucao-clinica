import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const projectId = process.env.SUPABASE_PROJECT_ID;

if (!dbPassword || !projectId) {
  console.error("Missing database environment variables.");
  process.exit(1);
}

const connectionString = `postgresql://postgres:${dbPassword}@db.${projectId}.supabase.co:5432/postgres`;

async function main() {
  const client = new pg.Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to database successfully!");

    const checks = [
      { name: "Tabela patient_reports", sql: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'patient_reports')" },
      { name: "Coluna patients.quick_notes", sql: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'quick_notes')" },
      { name: "Coluna professionals.professional_register", sql: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'professionals' AND column_name = 'professional_register')" },
      { name: "Coluna patients.birth_date", sql: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'birth_date')" },
      { name: "Coluna patients.phone", sql: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'phone')" },
      { name: "Tabela support_tickets", sql: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'support_tickets')" },
      { name: "Tabela evolution_templates", sql: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_templates')" },
      { name: "Coluna patients.default_template_id", sql: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'default_template_id')" },
    ];

    console.log("\n--- Checking database state ---");
    for (const check of checks) {
      const res = await client.query(check.sql);
      const exists = res.rows[0].exists;
      console.log(`${check.name}: ${exists ? "EXISTE" : "NÃO EXISTE"}`);
    }

  } catch (error) {
    console.error("Database query error:", error);
  } finally {
    await client.end();
  }
}

main();
