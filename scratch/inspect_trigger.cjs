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
      "SELECT routine_definition FROM information_schema.routines WHERE routine_name = 'handle_evolution_signing'"
    );

    if (res.rows.length > 0) {
      console.log('Código da função handle_evolution_signing:');
      console.log(res.rows[0].routine_definition);
    } else {
      console.log('Função handle_evolution_signing não encontrada.');
    }

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await client.end();
  }
}

run();
