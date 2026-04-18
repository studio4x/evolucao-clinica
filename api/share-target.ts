import { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // O objetivo desta rota é apenas aceitar o POST do Share Target do Android
  // e retornar o HTML do aplicativo. O Service Worker (sw.js) deve interceptar
  // este POST no lado do cliente, mas se ele falhar ou estiver desativado, 
  // esta API garante que não ocorra erro 405.
  
  const htmlPath = path.join(process.cwd(), 'dist', 'index.html');
  
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }

  // Fallback caso dist/index.html não exista (ex: durante build ou dev)
  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head><meta http-equiv="refresh" content="0; url=/" /></head>
      <body>Redirecionando para o aplicativo...</body>
    </html>
  `);
}
