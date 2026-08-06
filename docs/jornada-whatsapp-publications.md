# Fila de publicações da Jornada de 15 Dias

Esta etapa mantém a fonte de verdade e a fila segura na plataforma. O envio continua exclusivamente no workflow n8n, acionado pelo Supabase depois da publicação editorial; o frontend e o backend da plataforma não chamam a Evolution nem enviam WhatsApp diretamente.

## Contrato

Migration: `supabase/migrations/20260806100000_create_journey_whatsapp_publications.sql`.

O backend reutiliza `journeys` e `journey_contents`. A chave inicial é `jornada-15-dias-operador-evolucao-clinica`, centralizada em `server/whatsapp/journeyPublications.ts`. Ela representa o WhatsApp operador; não representa o grupo. A fila é backend-only, com RLS sem acesso a `anon`/`authenticated`, e Service Role no backend.

As rotas internas exigem `Authorization: Bearer <WHATSAPP_JOURNEY_PUBLICATION_TOKEN>`:

```json
POST /api/integrations/whatsapp/journey-publications/claim
{"destinationKey":"jornada-15-dias-operador-evolucao-clinica","workerId":"n8n-publicacao-jornada","provider":"evolution"}
```

Retorna `{ "claimed": false, "publication": null }` quando não há item vencido. Quando há, retorna `publicationId`, conteúdo editorial, `hasWhatsappMessage`, URL pública derivada da jornada, `scheduledAt`, `claimExpiresAt` e `attempt`.

Conclusão:

```json
POST /api/integrations/whatsapp/journey-publications/complete
{"publicationId":"uuid","provider":"manual","providerMessageId":null,"publishedAt":"2026-08-10T11:05:00Z"}
```

Falha:

```json
POST /api/integrations/whatsapp/journey-publications/fail
{"publicationId":"uuid","errorCode":"PROVIDER_UNAVAILABLE","errorMessage":"Provedor indisponível","retryable":true}
```

Falhas retryable usam 5, 15, 30 e 60 minutos; após `max_attempts` tornam-se `failed`. Claims expiram em 15 minutos e são recuperados pela RPC atômica com `FOR UPDATE SKIP LOCKED`. A restrição `(journey_content_id, destination_key)` impede duplicidade.

`journey_contents.published_at` é o momento em que a página pública foi publicada. `journey_whatsapp_publications.published_at` é mantido por compatibilidade e representa a entrega ao WhatsApp operador (`sent`); não representa encaminhamento ao grupo.

## Ambiente e implantação

Adicionar na Vercel, sem prefixo `VITE_`:

```text
WHATSAPP_JOURNEY_PUBLICATION_TOKEN=
WHATSAPP_JOURNEY_DEFAULT_DESTINATION_KEY=jornada-15-dias-operador-evolucao-clinica
PUBLIC_APP_URL=https://www.evolucaoclinica.app.br
```

Aplicar as migrations no Supabase antes de usar as rotas. O JID não é configurado nem retornado pela plataforma; é resolvido pelo n8n. A rota administrativa `GET /api/admin/journey-whatsapp-publications` usa a sessão autenticada e `requireAdmin`; a tela de conteúdos da jornada exibe status editorial e da fila, tentativas, data, erro resumido e ações confirmadas de recolocar/cancelar.

## Acionamento automático n8n

O job editorial `publish-journey-contents-job` executa em `*/5 * * * *`. Dois minutos depois, `journey-whatsapp-operator-dispatch` executa em `2-59/5 * * * *` e faz um `POST` vazio ao webhook de produção configurado no Vault. URL e Bearer ficam somente em `journey_n8n_webhook_url` e `journey_n8n_webhook_token`; o segundo tem o mesmo valor de `WHATSAPP_JOURNEY_PUBLICATION_TOKEN` na Vercel e no n8n.

Cada execução do workflow trata no máximo uma publicação: executa `claim`, envia pela Evolution e só chama `complete` depois de receber `providerMessageId`; `fail` é reservado para erro real. Com fila vazia, o resultado esperado é `claimed: false` e nenhuma chamada à Evolution, `complete` ou `fail`. Não há Schedule Trigger no n8n, Vercel Cron ou cron no backend.

## Reset manual de envio

Para testar novamente uma publicação `sent`, um administrador pode usar **Resetar envio** na tela `/admin/jornada/:journeySlug/conteudos`. A confirmação exige a frase `RESETAR DIA X`. O reset usa a mesma rota de ações (`POST /api/admin/journey-whatsapp-publications/:id/action`, com `action: reset_sent`) e uma função SQL transacional que bloqueia a linha, valida status, destino e provedor, registra `journey_whatsapp_sent_reset` em `admin_audit_logs` e remove somente a linha operacional. Não altera `journey_contents`, não chama n8n, Evolution, claim, complete ou fail, e a mensagem anterior permanece no WhatsApp.

Com conteúdo em `draft`, o envio fica fora da fila até ser agendado e publicado novamente. Em `scheduled`, fica liberado apenas depois da publicação programada. Em `published` com horário vencido, a próxima sincronização pode recriar a linha como `pending`, permitindo o próximo ciclo automático. Isso difere de **Recolocar na fila**, que recupera uma publicação `failed` existente. A operação exige sessão administrativa, é individual e não possui reset em massa. Para rollback, interrompa a automação externa, preserve/exporte a auditoria e a fila, reverta código/migration e não remova conteúdos editoriais.

## Contrato final do claim

O n8n deve enviar `provider: "evolution"` e usar somente a `destinationKey` abaixo:

```bash
curl -X POST "$PUBLIC_APP_URL/api/integrations/whatsapp/journey-publications/claim" \
  -H "Authorization: Bearer $WHATSAPP_JOURNEY_PUBLICATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destinationKey":"jornada-15-dias-operador-evolucao-clinica","workerId":"n8n-publicacao-jornada","provider":"evolution"}'
```

O sucesso contém `centralUrl`, `contentUrl`, `contentPublishedAt`, `imageUrl`, `videoUrl`, `hasWhatsappMessage`, `scheduledAt`, `claimExpiresAt` e `attempt`. `contentUrl` usa a âncora do conteúdo na página central (por exemplo, `/jornada/jornada-15-dias/#boas-vindas`), permitindo que a pessoa navegue livremente depois da abertura. `imageUrl` e `videoUrl` são opcionais; quando nulos, o n8n publica apenas texto/link. `claimed: false` significa que não há item vencido elegível. O estado `sent` significa somente entrega ao WhatsApp operador, confirmada pelo n8n/Evolution; não confirma encaminhamento ao grupo.

Para concluir, o n8n envia `publicationId`, `provider: "evolution"`, `providerMessageId` retornado pela Evolution e `publishedAt` da entrega. Repetir o complete retorna sucesso idempotente. Em falha, enviar `errorCode`, `errorMessage` sanitizada e `retryable`; a página continua publicada e a fila aplica backoff de 5, 15, 30 e 60 minutos.

O smoke test seguro está em `scripts/journey-whatsapp-smoke-test.ts`. Use `npx tsx scripts/journey-whatsapp-smoke-test.ts --local`, `--linked-read-only` ou `--production-read-only`; nenhum modo executa claim válido ou envio WhatsApp. A especificação OpenAPI está em `docs/jornada-whatsapp-publications.openapi.yaml`.

## Rollback

Para interromper os envios automáticos, desative ou remova somente `journey-whatsapp-operator-dispatch`, desative o workflow n8n e mantenha os conteúdos em `draft`. Não remova os outros jobs, migrations, conteúdos de `journeys`/`journey_contents` ou histórico editorial/público.

## Limitações conhecidas

O sincronismo ocorre no momento do claim e depende de migration aplicada. Conteúdos sem `whatsapp_message` não entram na fila; a resposta sinaliza `hasWhatsappMessage: false` apenas para itens já enfileirados. Nenhum provedor é chamado pelo backend.
