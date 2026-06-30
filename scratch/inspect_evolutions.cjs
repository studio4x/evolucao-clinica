const { Client } = require('pg');

const connectionString = 'postgresql://postgres:epdsAmnkCXtSqVCv@db.kvxboovgrrhhttaqinld.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('Conectado ao banco!');

    const patientId = 'bf2b60f1-9bcf-4c37-a55a-3fc19d82ea2d';
    const res = await client.query(
      'SELECT id, transcription_text, embedding, transcription_status, status, created_at FROM evolutions WHERE patient_id = $1',
      [patientId]
    );

    console.log(`Encontradas ${res.rows.length} evoluções para o paciente.`);
    res.rows.forEach((row, i) => {
      console.log(`\n--- Evolução ${i + 1} ---`);
      console.log(`ID: ${row.id}`);
      console.log(`transcription_status: ${row.transcription_status}`);
      console.log(`status: ${row.status}`);
      console.log(`transcription_text (length): ${row.transcription_text ? row.transcription_text.length : 'NULL'}`);
      console.log(`embedding is null?: ${row.embedding === null}`);
      if (row.transcription_text) {
        console.log(`Trecho transcription_text: ${row.transcription_text.substring(0, 200)}...`);
      }
    });

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await client.end();
  }
}

run();
