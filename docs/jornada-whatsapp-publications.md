# Fila de publicações da Jornada de 15 Dias

Esta etapa adiciona somente a fonte de verdade e a fila segura da plataforma. Não existe envio para WhatsApp, Evolution API, Cloud API, WAHA, Baileys ou n8n neste repositório.

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

Aplicar a migration no Supabase antes de usar as rotas. O JID não é configurado nem retornado pela plataforma; será resolvido posteriormente no n8n. A rota administrativa `GET /api/admin/journey-whatsapp-publications` usa a sessão autenticada e `requireAdmin`; a tela de conteúdos da jornada exibe status editorial e da fila, tentativas, data, erro resumido e ações confirmadas de recolocar/cancelar.

## Contrato final do claim

O n8n deve enviar `provider: "evolution"` e usar somente a `destinationKey` abaixo:

```bash
curl -X POST "$PUBLIC_APP_URL/api/integrations/whatsapp/journey-publications/claim" \
  -H "Authorization: Bearer $WHATSAPP_JOURNEY_PUBLICATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destinationKey":"jornada-15-dias-operador-evolucao-clinica","workerId":"n8n-publicacao-jornada","provider":"evolution"}'
```

O sucesso contém `centralUrl`, `contentUrl`, `contentPublishedAt`, `imageUrl`, `videoUrl`, `hasWhatsappMessage`, `scheduledAt`, `claimExpiresAt` e `attempt`. `imageUrl` e `videoUrl` são opcionais; quando nulos, o n8n publica apenas texto/link. `claimed: false` significa que não há item vencido elegível. O estado `sent` significa somente entrega ao WhatsApp operador, confirmada pelo n8n/Evolution; não confirma encaminhamento ao grupo.

Para concluir, o n8n envia `publicationId`, `provider: "evolution"`, `providerMessageId` retornado pela Evolution e `publishedAt` da entrega. Repetir o complete retorna sucesso idempotente. Em falha, enviar `errorCode`, `errorMessage` sanitizada e `retryable`; a página continua publicada e a fila aplica backoff de 5, 15, 30 e 60 minutos.

O smoke test seguro está em `scripts/journey-whatsapp-smoke-test.ts`. Use `npx tsx scripts/journey-whatsapp-smoke-test.ts --local`, `--linked-read-only` ou `--production-read-only`; nenhum modo executa claim válido ou envio WhatsApp. A especificação OpenAPI está em `docs/jornada-whatsapp-publications.openapi.yaml`.

## Rollback

Antes de remover a migration, interromper o worker externo e preservar/exportar a fila. Como não há envio implementado nesta etapa, o rollback pode remover a tabela e as funções desta migration após retirar as rotas/código da versão anterior. Não apagar conteúdos de `journeys` ou `journey_contents`, nem histórico editorial/público.

## Limitações conhecidas

O sincronismo ocorre no momento do claim e depende de migration aplicada. Conteúdos sem `whatsapp_message` não entram na fila; a resposta sinaliza `hasWhatsappMessage: false` apenas para itens já enfileirados. Nenhum provedor é chamado pelo backend.
