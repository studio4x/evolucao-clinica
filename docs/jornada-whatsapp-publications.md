# Fila de publicações da Jornada de 15 Dias

Esta etapa adiciona somente a fonte de verdade e a fila segura da plataforma. Não existe envio para WhatsApp, Evolution API, Cloud API, WAHA, Baileys ou n8n neste repositório.

## Contrato

Migration: `supabase/migrations/20260806100000_create_journey_whatsapp_publications.sql`.

O backend reutiliza `journeys` e `journey_contents`. A chave inicial é `jornada-15-dias-grupo-principal`, centralizada em `server/whatsapp/journeyPublications.ts`. A fila é backend-only, com RLS sem acesso a `anon`/`authenticated`, e Service Role no backend.

As rotas internas exigem `Authorization: Bearer <WHATSAPP_JOURNEY_PUBLICATION_TOKEN>`:

```json
POST /api/integrations/whatsapp/journey-publications/claim
{"destinationKey":"jornada-15-dias-grupo-principal","workerId":"n8n-publicacao-jornada","provider":"manual"}
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

## Ambiente e implantação

Adicionar na Vercel, sem prefixo `VITE_`:

```text
WHATSAPP_JOURNEY_PUBLICATION_TOKEN=
WHATSAPP_JOURNEY_DEFAULT_DESTINATION_KEY=jornada-15-dias-grupo-principal
WHATSAPP_JOURNEY_DEFAULT_DESTINATION_JID=
```

Aplicar a migration no Supabase antes de usar as rotas. O JID permanece opcional e não é versionado. A rota administrativa `GET /api/admin/journey-whatsapp-publications` usa a sessão autenticada e `requireAdmin`; a tela de conteúdos da jornada exibe status editorial e da fila, tentativas, data, erro resumido e ações confirmadas de recolocar/cancelar.

## Rollback

Antes de remover a migration, interromper o worker externo e preservar/exportar a fila. Como não há envio implementado nesta etapa, o rollback pode remover a tabela e as funções desta migration após retirar as rotas/código da versão anterior. Não apagar conteúdos de `journeys` ou `journey_contents`, nem histórico editorial/público.

## Limitações conhecidas

O sincronismo ocorre no momento do claim e depende de migration aplicada. Conteúdos sem `whatsapp_message` não entram na fila; a resposta sinaliza `hasWhatsappMessage: false` apenas para itens já enfileirados. Nenhum provedor é chamado pelo backend.
