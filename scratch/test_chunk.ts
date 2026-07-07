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

function chunkText(text: string, maxChunkSize: number): string[] {
  const chunks = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    let end = currentIndex + maxChunkSize;
    if (end >= text.length) {
      chunks.push(text.slice(currentIndex));
      break;
    }
    
    // Try to find a double newline to break cleanly
    let breakPoint = text.lastIndexOf('\n\n', end);
    if (breakPoint > currentIndex) {
      end = breakPoint + 2;
    } else {
      // Try single newline
      breakPoint = text.lastIndexOf('\n', end);
      if (breakPoint > currentIndex) {
        end = breakPoint + 1;
      }
    }
    
    chunks.push(text.slice(currentIndex, end));
    currentIndex = end;
  }
  
  return chunks;
}

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
    
    const chunks = chunkText(text, 20000);
    console.log(`Texto dividido em ${chunks.length} partes.`);
    
    const geminiStart = Date.now();
    
    const promises = chunks.map(async (chunkText, index) => {
      const prompt = `Analise o texto a seguir contendo anotações de evolução clínica de um paciente. 
Identifique todas as sessões de terapia/atendimento listadas no texto.
Para cada sessão identificada, extraia:
1. "date": A data da sessão no formato YYYY-MM-DD. Se a data estiver parcial, infira o ano com base no contexto ou assuma 2026. Se não houver data, tente deduzir ou use a data atual.
2. "time": O horário da sessão no formato HH:MM (se houver, senão retorne nulo).
3. "content": O conteúdo clínico completo da evolução/anotação dessa sessão (remova cabeçalhos repetitivos, mas preserve todo o relato do atendimento).

Retorne os dados estritamente em formato JSON válido como um array de objetos. Não adicione markdown (como \`\`\`json ou similar), blocos de código ou explicações. Retorne EXCLUSIVAMENTE o JSON estruturado no formato:
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "content": "Texto da evolução..."
  }
]

Texto a ser analisado:
${chunkText}`;

      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      return { index, text: res.text };
    });

    const responses = await Promise.all(promises);
    const duration = Date.now() - geminiStart;
    
    console.log(`Gemini retornou TUDO em ${duration}ms!`);
    
    let allSessions: any[] = [];
    for (const res of responses) {
      if (res.text) {
        try {
          const sessions = JSON.parse(res.text);
          allSessions = allSessions.concat(sessions);
        } catch(e) {
           console.log("Erro ao parsear chunk", res.index);
        }
      }
    }
    
    console.log(`Total de sessões identificadas: ${allSessions.length}`);
  } catch (err: any) {
    console.error("ERRO:", err);
  }
}

run();
