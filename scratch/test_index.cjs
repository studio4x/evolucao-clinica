const { Client } = require('pg');
const { GoogleGenAI } = require('@google/genai');

const connectionString = 'postgresql://postgres:epdsAmnkCXtSqVCv@db.kvxboovgrrhhttaqinld.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('Conectado ao banco!');

    // Obter chave do Gemini do banco
    const settingsRes = await client.query(
      'SELECT api_key FROM settings WHERE id = \'gemini\''
    );
    const apiKey = settingsRes.rows[0]?.api_key;
    if (!apiKey) {
      throw new Error('Chave do Gemini não encontrada na tabela settings!');
    }
    console.log(`Chave do Gemini lida do banco (comprimento: ${apiKey.length}, prefixo: ${apiKey.substring(0, 10)}...)`);

    const ai = new GoogleGenAI({ apiKey });

    // Buscar evoluções sem embedding
    const patientId = 'bf2b60f1-9bcf-4c37-a55a-3fc19d82ea2d';
    const res = await client.query(
      'SELECT id, transcription_text FROM evolutions WHERE patient_id = $1 AND embedding IS NULL AND transcription_status = \'completed\'',
      [patientId]
    );

    console.log(`Encontradas ${res.rows.length} evoluções sem embedding para o paciente.`);

    for (const row of res.rows) {
      console.log(`\nIndexando evolução ID: ${row.id}...`);
      try {
        const embedRes = await ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: row.transcription_text.trim(),
          config: {
            outputDimensionality: 768
          }
        });

        console.log('Resposta do Gemini recebida com sucesso!');
        if (embedRes.embeddings && embedRes.embeddings[0]?.values) {
          const values = embedRes.embeddings[0].values;
          console.log(`Embedding gerado com sucesso! Tamanho do vetor: ${values.length}`);
          const vectorString = `[${values.join(',')}]`;
          
          const updateRes = await client.query(
            'UPDATE evolutions SET embedding = $1::vector WHERE id = $2',
            [vectorString, row.id]
          );
          console.log(`Banco atualizado com sucesso! Rows alteradas: ${updateRes.rowCount}`);
        } else {
          console.log('Resposta do Gemini não contém embeddings válidos:', embedRes);
        }
      } catch (err) {
        console.error(`Erro ao indexar evolução ${row.id}:`, err);
      }
    }

  } catch (err) {
    console.error('Erro geral:', err);
  } finally {
    await client.end();
  }
}

run();
