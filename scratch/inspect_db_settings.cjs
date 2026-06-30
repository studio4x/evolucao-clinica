const { Client } = require('pg');

const connectionString = 'postgresql://postgres:epdsAmnkCXtSqVCv@db.kvxboovgrrhhttaqinld.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('Conectado ao banco!');

    const res = await client.query(
      'SELECT id, api_key FROM settings'
    );

    console.log(`Encontrados ${res.rows.length} registros em settings:`);
    res.rows.forEach((row) => {
      console.log(`ID: ${row.id}`);
      console.log(`api_key (length): ${row.api_key ? row.api_key.length : 'NULL'}`);
      console.log(`api_key (prefix): ${row.api_key ? row.api_key.substring(0, 10) + '...' : 'NULL'}`);
    });

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await client.end();
  }
}

run();
