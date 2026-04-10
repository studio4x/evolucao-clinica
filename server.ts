import express from "express";
import path from "path";
import multer from "multer";
import { google } from "googleapis";
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

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set up multer for audio uploads (no longer used for transcription but kept for compatibility if needed)
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

// Process Evolution Route - Now only handles Google Docs insertion via JSON
app.post("/api/process-evolution", async (req, res) => {
  console.log("--- INICIANDO INSERÇÃO NO GOOGLE DOCS ---");
  try {
    const { googleAccessToken, googleDocId, patientName, sessionDate, transcription } = req.body;

    console.log("Dados recebidos (JSON):", { 
      hasGoogleToken: !!googleAccessToken, 
      googleDocId, 
      patientName, 
      sessionDate, 
      transcriptionLength: transcription?.length
    });

    if (!googleAccessToken || !googleDocId) {
      console.log("Erro: Credenciais do Google ou Doc ID ausentes.");
      return res.status(400).json({ error: "Missing Google credentials or Doc ID" });
    }

    if (!transcription) {
      console.log("Erro: Transcrição ausente.");
      return res.status(400).json({ error: "Missing transcription" });
    }

    // 2. Append to Google Docs
    console.log("Iniciando batchUpdate no Google Docs...");
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
    
    const textToAppend = `Data da sessão: ${formattedDate} às ${formattedTime}\n\nEvolução:\n${transcription}\n\n----------------------------------------\n\n`;

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
      transcription: transcription 
    });
    console.log("--- PROCESSO FINALIZADO ---");

  } catch (error: any) {
    console.error("Erro durante a inserção no Google Docs:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// API 404 Catch-all
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Error handling middleware to ensure JSON responses for API errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express error:", err);
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } else {
    next(err);
  }
});

export async function startServer() {
  try {
    // Startup check for Gemini API Key
    const startupKey = process.env.GEMINI_API_KEY;
    if (!startupKey) {
      console.warn("Chave da API Gemini não detectada no início do servidor.");
    } else {
      console.log(`Servidor iniciado com chave Gemini detectada.`);
    }

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
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
