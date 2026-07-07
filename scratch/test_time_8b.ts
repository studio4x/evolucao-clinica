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
    const { data: settingsData } = await supabaseAdmin.from("settings").select("api_key").eq("id", "gemini").single();
    if (!settingsData || !settingsData.api_key) return;
    const ai = new GoogleGenAI({ apiKey: settingsData.api_key });

    const { data: requests } = await supabaseAdmin.from('migration_requests').select('*').order('created_at', { ascending: false }).limit(1);
    const request = requests![0];
    
    const { data: fileData } = await supabaseAdmin.storage.from("support_attachments").download(request.attachment_url);
    const arrayBuf = await fileData!.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    const prompt = `Analise o texto a seguir contendo anotações de evolução clínica de um paciente. 
Identifique todas as sessões de terapia listadas no texto.
Para cada sessão, extraia:
1. "date": A data da sessão no formato YYYY-MM-DD. Se a data estiver parcial, infira o ano com base no contexto ou assuma 2026.
2. "time": O horário da sessão no formato HH:MM (se houver, senão retorne nulo).
3. "content": O conteúdo clínico completo da evolução/anotação dessa sessão (remova cabeçalhos repetitivos desnecessários, mas preserve todo o relato do atendimento).

Retorne EXCLUSIVAMENTE um JSON estruturado no formato:
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "content": "Texto..."
  }
]

Texto a ser analisado:
${text}`;

    console.log("Chamando Gemini (gemini-1.5-flash-8b)...");
    const geminiStart = Date.now();
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash-8b",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const duration = Date.now() - geminiStart;
    
    console.log(`Gemini retornou em ${duration}ms!`);
    console.log(`Tamanho da resposta: ${geminiResponse.text?.length} chars`);
    
  } catch (err: any) {
    console.error("ERRO:", err);
  }
}

run();
