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

    console.log("\n--- Columns in 'professionals' table ---");
    const colsRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'professionals'
      ORDER BY ordinal_position;
    `);
    console.table(colsRes.rows);

  } catch (error) {
    console.error("Database query error:", error);
  } finally {
    await client.end();
  }
}

main();
