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

const pendingVersions = [
  '20260622220000',
  '20260622230000',
  '20260622240000',
  '20260622250000',
  '20260622260000',
  '20260622270000',
  '20260622280000',
  '20260623100000',
  '20260623170000',
  '20260623180000',
  '20260623190000'
];

async function main() {
  const client = new pg.Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to database successfully!");

    console.log("\nSynchronizing migration history...");
    for (const version of pendingVersions) {
      try {
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING;`,
          [version]
        );
        console.log(`Migration version ${version} marked as applied.`);
      } catch (err: any) {
        console.error(`Failed to mark migration version ${version}:`, err.message);
      }
    }

    console.log("\nMigration synchronization complete!");

  } catch (error) {
    console.error("Database query error:", error);
  } finally {
    await client.end();
  }
}

main();
