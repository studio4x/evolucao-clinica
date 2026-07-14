<div align="center">
  <img width="1200" height="475" alt="Evolução Clínica" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Evolução Clínica

Plataforma web para gravação, transcrição e organização de evoluções clínicas com IA, Google Docs, pacientes, histórico e recursos offline.

## Repositório

- [studio4x/evolucao-clinica](https://github.com/studio4x/evolucao-clinica)

## Visão geral

O projeto combina frontend React, backend em Node/Express e integrações com:

- Gemini para transcrição e processamento de áudio.
- Supabase para autenticação, persistência e dados do app.
- Google Docs e Google Picker para envio e seleção de prontuários.
- PWA e fila offline para melhorar a experiência em conexões instáveis.

## Como executar localmente

### Pré-requisitos

- Node.js 18 ou superior
- npm
- Credenciais dos serviços usados no ambiente

### Instalação

1. Instale as dependências com `npm install`.
2. Crie `.env.local` na raiz do projeto.
3. Preencha as variáveis obrigatórias:
   ```bash
   GEMINI_API_KEY=...
   VITE_GOOGLE_PICKER_API_KEY=...
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. Inicie o app com `npm run dev`.

## Variáveis de ambiente

### Obrigatórias para a experiência principal

- `GEMINI_API_KEY`: chave usada para transcrição/processamento de áudio.
- `VITE_GOOGLE_PICKER_API_KEY`: chave usada pelo seletor de documentos do Google.
- `VITE_SUPABASE_URL`: URL do projeto Supabase.
- `VITE_SUPABASE_ANON_KEY`: chave anônima do Supabase.

### Variáveis adicionais do servidor

Dependendo dos recursos habilitados no ambiente, o backend também pode usar:

- `GEMINI_API_KEY_REAL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `VERCEL_PRODUCTION_URL`

## Scripts disponíveis

- `npm run dev`: inicia o app em desenvolvimento.
- `npm run build`: gera a build de produção em `dist/`.
- `npm run preview`: serve a build localmente.
- `npm run lint`: executa a checagem TypeScript.
- `npm run clean`: remove `dist/`.

## Estrutura principal

- `src/pages/`: telas do aplicativo.
- `src/components/`: componentes reutilizáveis.
- `src/services/`: integrações com APIs e regras de domínio.
- `server.ts`: backend Express usado no desenvolvimento e em rotas server-side.
- `api/`: funções serverless e pontos de integração.

## Observações de desenvolvimento

- A build do rodapé é obrigatória em qualquer alteração de código e fica em [`src/components/layout/AppVersion.tsx`](src/components/layout/AppVersion.tsx).
- O fluxo de entrega esperado é: alterar o código, atualizar a build, criar commit e fazer push.
- Quando a política do repositório exigir, os commits finais devem ir para `main`.
- Não encerre a tarefa com mudanças apenas locais.

## Aplicativo Móvel (Android / Google Play)

Para detalhes sobre como atualizar as versões do aplicativo móvel, baixar os novos ícones, gerar novos arquivos `.apk` ou `.aab` e enviá-los para a Google Play Store, consulte o guia passo a passo em [PLAY_STORE_RUNBOOK.md](file:///c:/PLATAFORMAS%20VS%20CODE/EVOLUÇÃO%20CLINICA/evolucao-clinica/PLAY_STORE_RUNBOOK.md).

## Deploy

O repositório já inclui configuração compatível com ambientes de deploy baseados em Vercel.
Se o seu fluxo de publicação for diferente, ajuste apenas as variáveis de ambiente equivalentes.
