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
    const ai = new GoogleGenAI({ apiKey });

    // 1. Gerar embedding para a pergunta
    const query = 'nos três primeiros meses, o cliente paga quanto?';
    console.log(`Gerando embedding para a pergunta: "${query}"...`);
    const queryEmbedResponse = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: query.trim(),
      config: {
        outputDimensionality: 768
      }
    });

    const queryVector = queryEmbedResponse.embeddings[0].values;
    const queryVectorString = `[${queryVector.join(',')}]`;

    // 2. Buscar no banco via match_evolutions
    console.log('Buscando evoluções similares no Postgres remoto...');
    const patientId = 'bf2b60f1-9bcf-4c37-a55a-3fc19d82ea2d';
    const matchRes = await client.query(
      'SELECT * FROM match_evolutions($1::vector, $2::float, $3::int, $4::uuid, $5::uuid)',
      [queryVectorString, 0.35, 5, patientId, '27bf49b4-6a84-4861-abdf-6be9a4eb48cf'] // Usamos o professional_id real ou simplesmente fazemos a query diretamente se quisermos burlar o RLS
    );

    // Se o RLS limitar pelo professional_id do usuário, podemos fazer uma consulta direta por similaridade de cosseno no banco admin para fins de teste
    let matches = matchRes.rows;
    if (matches.length === 0) {
      console.log('Nenhum resultado via match_evolutions (provavelmente professional_id diferente no teste). Rodando similaridade direta...');
      const directRes = await client.query(
        `SELECT id, session_date, transcription_text, (1 - (embedding <=> $1::vector)) as similarity 
         FROM evolutions 
         WHERE patient_id = $2 AND embedding IS NOT NULL 
         ORDER BY similarity DESC LIMIT 5`,
        [queryVectorString, patientId]
      );
      matches = directRes.rows;
    }

    console.log(`Encontrados ${matches.length} trechos relevantes:`);
    matches.forEach((m, i) => {
      console.log(`\n[Trecho ${i + 1}] Data: ${m.session_date} | Similaridade: ${m.similarity || m.cosine_similarity}`);
      console.log(m.transcription_text.substring(0, 300) + '...');
    });

    if (matches.length === 0) {
      console.log('Nenhum trecho relevante encontrado.');
      return;
    }

    // 3. Gerar resposta com Gemini
    const context = matches
      .map(m => `Sessão de ${new Date(m.session_date || m.created_at).toLocaleDateString('pt-BR')}:\n${m.transcription_text}`)
      .join('\n\n---\n\n');

    console.log('\nGerando resposta final com o Gemini...');
    const systemPrompt = `Você é um assistente clínico de IA. O terapeuta fez uma pergunta sobre o histórico do paciente.
Responda de forma clara, humanizada e extremamente amigável, focando nos dados fornecidos abaixo.
Proíba qualquer termo técnico de IA ou jargão computacional (como "com base no contexto fornecido", "nos documentos recuperados", "no banco de dados", "modelo", "algoritmo", etc.). Responda como se você soubesse diretamente a informação contida nas anotações de evolução do paciente.
Sempre cite a data da evolução onde a informação foi encontrada de forma natural (ex: "Na evolução do dia 10/12/2025...").`;

    const geminiRes = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `Pergunta: ${query}\n\nDados do histórico do paciente:\n${context}` }] }
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3
      }
    });

    console.log('\n--- RESPOSTA DA IA ---');
    console.log(geminiRes.text);

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await client.end();
  }
}

run();
