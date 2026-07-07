import { createRequire } from 'module';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

dotenv.config({ path: '.env.local' });

const projectId = process.env.SUPABASE_PROJECT_ID;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabaseUrl = `https://${projectId}.supabase.co`;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    console.log("Buscando chave do Gemini na tabela settings...");
    const { data: settingsData } = await supabaseAdmin.from("settings").select("api_key").eq("id", "gemini").single();
    if (!settingsData || !settingsData.api_key) return;
    const ai = new GoogleGenAI({ apiKey: settingsData.api_key });

    const { data: requests } = await supabaseAdmin.from('migration_requests').select('*').order('created_at', { ascending: false }).limit(1);
    const request = requests![0];
    
    const { data: fileData } = await supabaseAdmin.storage.from("support_attachments").download(request.attachment_url);
    const arrayBuf = await fileData!.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    
    console.log("Extraindo texto...");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    const prompt = `Analise o texto a seguir contendo anotações de evolução clínica de um paciente. 
Sua tarefa é mapear onde cada sessão de terapia começa e termina no texto original, sem reescrever o conteúdo da sessão.
Para cada sessão identificada, extraia:
1. "date": A data da sessão no formato YYYY-MM-DD. (Assuma 2026 se o ano faltar. Se não houver data, deduza pelo contexto ou use null).
2. "time": O horário da sessão no formato HH:MM (se houver, senão null).
3. "first_sentence": As primeiras 10 a 15 palavras do relato da sessão (exatamente como estão escritas no texto original, para que possamos localizá-las no texto).
4. "last_sentence": As últimas 10 a 15 palavras que encerram o relato daquela sessão, logo antes da próxima sessão começar (exatamente como estão escritas no texto original).

Retorne EXCLUSIVAMENTE o JSON no formato de array de objetos:
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "first_sentence": "...",
    "last_sentence": "..."
  }
]

Texto a ser analisado:
${text}`;

    console.log("Chamando Gemini (abordagem otimizada)...");
    const geminiStart = Date.now();
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const duration = Date.now() - geminiStart;
    
    console.log(`Gemini retornou em ${duration}ms!`);
    console.log(`Tamanho da resposta: ${geminiResponse.text?.length} chars`);
    
    if (geminiResponse.text) {
      const sessions = JSON.parse(geminiResponse.text);
      console.log(`Sessões identificadas: ${sessions.length}`);
      if (sessions.length > 0) {
        console.log("Primeira sessão extraída do JSON:");
        console.log(sessions[0]);
      }
    }
  } catch (err: any) {
    console.error("ERRO:", err);
  }
}

run();
