# Central administrativa de disparos da captação

## Objetivo

Disponibilizar uma página administrativa para iniciar lotes do workflow de captação sem editar parâmetros diretamente no n8n.

URL planejada:

`/admin/captacao-disparos`

## Campos da página

- aba de origem;
- quantidade máxima do lote (1 a 50);
- template Meta aprovado.

A quantidade é um teto. O workflow continua aplicando suas regras de elegibilidade e pode processar menos contatos do que o máximo solicitado.

## Segurança

O navegador nunca chama o n8n diretamente e nunca recebe o token interno.

Fluxo:

1. navegador autenticado envia a configuração para `/api/admin/campaign-dispatch` com o access token da sessão Supabase;
2. o endpoint server-side valida a sessão e exige `professionals.role = admin`;
3. o endpoint valida aba, quantidade e template em allowlists;
4. o endpoint chama o webhook do n8n com um Bearer token server-side;
5. o n8n valida o token novamente antes de aceitar a solicitação;
6. o n8n responde HTTP 202 e continua o processamento do lote.

## Variáveis Vercel

Server-side, sem prefixo `VITE_`:

- `EVOLUCAO_CLINICA_BATCH_DISPATCH_WEBHOOK_URL`
- `EVOLUCAO_CLINICA_BATCH_DISPATCH_TOKEN`

O token deve ter o mesmo valor configurado no n8n.

## Variável n8n

- `EVOLUCAO_CLINICA_BATCH_DISPATCH_TOKEN`

A variável deve existir com o mesmo valor em `n8n_editor`, `n8n_webhook` e `n8n_worker`, e a alteração também deve permanecer registrada na stack do Portainer.

Nunca versionar o valor do token no GitHub nem inserir o segredo em um node.

## Workflow n8n

Versão correspondente: `Evolução Clínica - Disparo de Captação em Lotes - V1.13 Painel Web`.

Webhook:

`POST /webhook/evolucao-clinica/admin/captacao/disparar-lote`

O gatilho manual anterior permanece disponível como fallback.

## Travas preservadas

A V1.13 mantém as proteções existentes do lote, inclusive:

- `Liberado para disparo?` deve permanecer exatamente `SIM` na linha de origem;
- bloqueio de status já processados ou respondidos;
- limite de tentativas;
- somente números brasileiros quando configurado;
- dias úteis;
- janela 08h–20h;
- nova validação de janela antes de cada contato;
- intervalo de 60 segundos no caminho do painel;
- limite máximo de 50 contatos;
- retries de quota do Google Sheets;
- núcleo de disparo existente;
- logs em `logs_execucao`;
- aviso de conclusão via Evolution API.

## Observabilidade

Cada solicitação web recebe um `request_id` gerado no backend.

A V1.13 inclui esse identificador em `detalhe` na aba `logs_execucao` e no aviso de conclusão do lote. Isso permite correlacionar a ação da página com a execução do n8n.

## Implantação segura

1. importar V1.13 com `active=false`;
2. configurar a variável interna no n8n em editor/webhook/worker e registrar na stack;
3. configurar as duas variáveis server-side na Vercel;
4. desativar V1.12 e ativar V1.13;
5. publicar o código da página;
6. fazer um teste com `max_disparos_lote = 1` e exatamente um contato previamente liberado como `SIM`;
7. validar origem, controle interno, callback Meta, `logs_execucao` e aviso no grupo;
8. somente então ampliar os lotes.

## Rollback

Se a página ou o webhook apresentarem problema:

- desativar V1.13;
- reativar V1.12;
- manter a página sem uso até a correção;
- não reenviar contatos que já tenham sido reservados, aceitos pela Meta ou tenham callback final registrado.
