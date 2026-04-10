import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";
import { google } from "googleapis";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// --- LOGGING INTERCEPTOR FOR DEBUGGING ---
const logHistory: string[] = [];
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
  const msg = `[LOG] ${new Date().toISOString()} - ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  logHistory.push(msg);
  if (logHistory.length > 100) logHistory.shift();
  originalLog.apply(console, args);
};

console.error = function (...args) {
  const msg = `[ERR] ${new Date().toISOString()} - ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  logHistory.push(msg);
  if (logHistory.length > 100) logHistory.shift();
  originalError.apply(console, args);
};

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

export async function startServer() {
  try {
    // Startup check for Gemini API Key
    const startupKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY;
    if (!startupKey || startupKey === "MY_GEMINI_API_KEY") {
      console.warn("Chave da API Gemini não detectada ou usando placeholder no início do servidor.");
    } else {
      console.log(`Servidor iniciado com chave Gemini detectada.`);
    }

    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Set up multer for audio uploads using memory storage
    const upload = multer({ 
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 } // 50MB
    });

    // API Routes
    app.get("/api/health", (req, res) => {
      res.json({ status: "ok" });
    });

    app.get("/api/debug-env", (req, res) => {
      const envs = {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        HAS_GEMINI_KEY: !!(process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY),
        HAS_PICKER_KEY: !!process.env.VITE_GOOGLE_PICKER_API_KEY,
        PORT: PORT
      };
      res.json(envs);
    });

    app.get("/api/logs", (req, res) => {
      res.json({ logs: logHistory });
    });

    // Process Evolution Route
    app.post("/api/process-evolution", upload.single("audio"), async (req, res) => {
      console.log("--- INICIANDO PROCESSAMENTO DE EVOLUÇÃO ---");
      console.log("Request size (Content-Length):", req.headers['content-length']);
      try {
        const { googleAccessToken, googleDocId, patientName, sessionDate, audioUrl } = req.body;
        let fileBuffer: Buffer;
        let mimeType: string;

        console.log("Dados recebidos:", { 
          hasGoogleToken: !!googleAccessToken, 
          googleDocId, 
          patientName, 
          sessionDate, 
          audioUrl,
          hasFile: !!req.file 
        });

        if (req.file) {
          console.log("Usando arquivo de áudio enviado diretamente.");
          fileBuffer = req.file.buffer;
          mimeType = req.file.mimetype || "audio/webm";
        } else if (audioUrl) {
          console.log("Baixando áudio da URL do Firebase Storage...");
          const response = await fetch(audioUrl);
          if (!response.ok) throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
          const arrayBuffer = await response.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
          mimeType = response.headers.get("content-type") || "audio/webm";
          console.log("Áudio baixado com sucesso. Tamanho:", fileBuffer.length, "bytes");
        } else {
          console.log("Erro: Nenhum áudio fornecido.");
          return res.status(400).json({ error: "No audio file or URL provided" });
        }

        if (!googleAccessToken || !googleDocId) {
          console.log("Erro: Credenciais do Google ou Doc ID ausentes.");
          return res.status(400).json({ error: "Missing Google credentials or Doc ID" });
        }

        // Initialize Gemini
        let apiKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
          console.error("[ERR] Chave da API Gemini não configurada ou usando placeholder.");
          return res.status(400).json({ 
            error: "Chave da API Gemini não configurada. Por favor, configure sua chave real no painel de variáveis de ambiente da Vercel." 
          });
        }

        apiKey = apiKey.trim().replace(/^["']|["']$/g, '');
        console.log(`[LOG] Chave da API encontrada. Tamanho: ${apiKey.length}`);

        const ai = new GoogleGenAI({ apiKey }) as any;

        // 1. Transcribe Audio with Gemini
        console.log("Iniciando transcrição com Gemini...");
        const base64Audio = fileBuffer.toString("base64");
        
        const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Audio, mimeType } }
        ]);

        const response = await result.response;
        const transcriptionText = response.text();
        
        if (!transcriptionText) {
          throw new Error("A IA não retornou nenhuma transcrição para este áudio.");
        }
        
        console.log("Transcrição concluída com sucesso. Tamanho do texto:", transcriptionText.length);

        // 2. Append to Google Docs
        console.log("Iniciando inserção no Google Docs...");
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: googleAccessToken });

        const docs = google.docs({ version: "v1", auth: oauth2Client });
        
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        let formattedDate = sessionDate;
        if (sessionDate && sessionDate.includes('-')) {
          const [year, month, day] = sessionDate.split('-');
          formattedDate = `${day}/${month}/${year}`;
        }
        
        const textToAppend = `Data da sessão: ${formattedDate} às ${formattedTime}\n\nEvolução:\n${transcriptionText}\n\n----------------------------------------\n\n`;

        await docs.documents.batchUpdate({
          documentId: googleDocId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: textToAppend,
                },
              },
            ],
          },
        });
        console.log("Inserção no Google Docs concluída com sucesso.");

        res.json({ 
          success: true, 
          transcription: transcriptionText 
        });
        console.log("--- PROCESSAMENTO FINALIZADO COM SUCESSO ---");

      } catch (error: any) {
        console.error("Erro durante o processamento da evolução:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
      }
    });

    // API 404 Catch-all
    app.all("/api/*", (req, res) => {
      res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    // Error handling middleware to ensure JSON responses for API errors
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error("Express error:", err);
      if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({ 
          error: err.message || "Internal Server Error",
          details: err.stack
        });
      } else {
        next(err);
      }
    });

    if (!process.env.VERCEL) {
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });

      // Increase timeout to 5 minutes for long audio processing
      server.timeout = 300000;
      server.keepAliveTimeout = 301000;
      server.headersTimeout = 302000;
    }
  } catch (err) {
    console.error("CRITICAL STARTUP ERROR:", err);
  }
}

// Start the server if not in a Vercel environment
if (!process.env.VERCEL) {
  startServer();
}
