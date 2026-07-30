# WhatsApp Cloud API

O envio do WhatsApp é realizado diretamente pelo backend para a Graph API da
Meta. Cada tentativa é criada como `pending` em
`public.whatsapp_message_deliveries` antes da chamada HTTP e passa para
`accepted` ou `failed` após a resposta.

`accepted` significa somente que a Meta aceitou o POST para processamento. Os
estados `sent`, `delivered` e `read` dependem dos futuros webhooks de status e
não são inferidos pelo envio inicial.

## Variáveis protegidas do servidor

Configure na Vercel, sem prefixo `VITE_`:

```text
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS=false
WHATSAPP_N8N_EVENTS_TOKEN=
```

`WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS=true` só é aceito fora de produção e deve ser
usado, quando estritamente necessário, em desenvolvimento local. O padrão é
`false`.

O backend também exige:

```text
SUPABASE_SERVICE_ROLE_KEY=
```

Essa chave não pode usar prefixo `VITE_`, não possui fallback para a chave
anônima e nunca deve ser enviada ao navegador.

## Aplicação da migration

Aplique
`supabase/migrations/20260730190000_create_whatsapp_message_deliveries.sql` no
projeto Supabase correspondente ao ambiente. A migration:

- cria a tabela e seus índices;
- habilita RLS;
- revoga acesso de `anon` e `authenticated`;
- concede operações somente a `service_role`;
- remove do JSON legado de `notification_settings` as credenciais e o número
  de teste do WhatsApp.

Depois da migration, valide que o backend com Service Role cria e atualiza um
registro de teste e que uma sessão comum do frontend não consegue consultar a
tabela.

## Rotação obrigatória da chave exposta

O código anterior continha uma Service Role do Supabase codificada em Base64.
Remover o fallback do repositório não revoga a credencial já exposta.

Um administrador do Supabase deve rotacionar manualmente a chave anteriormente
exposta, atualizar `SUPABASE_SERVICE_ROLE_KEY` na Vercel e em outros ambientes
backend autorizados e gerar um novo deploy. Não tente automatizar essa rotação
pelo aplicativo.

## Eventos internos normalizados pelo n8n

`POST /api/integrations/whatsapp/events` é um endpoint interno exclusivo para
o roteador n8n. Ele não é um callback da Meta e não usa
`x-hub-signature-256`, `WHATSAPP_APP_SECRET` nem o Verify Token do webhook
público. O n8n deve enviar somente:

```http
Authorization: Bearer <WHATSAPP_N8N_EVENTS_TOKEN>
Content-Type: application/json
```

O token é lido apenas no backend, a comparação é segura e nenhuma credencial
é salva nos eventos. Configure um valor forte e diferente por ambiente na
Vercel, sem prefixo `VITE_`.

Contrato normalizado:

```json
{
  "tenant": "producao",
  "eventType": "message_status",
  "eventKey": "meta:wamid.exemplo:delivered:2026-07-30T12:00:00.000Z",
  "messageId": "wamid.exemplo",
  "status": "delivered",
  "receivedAt": "2026-07-30T12:00:00.000Z",
  "phoneNumberId": "123456789",
  "senderPhone": "5511999999999",
  "recipientPhone": "5511888888888",
  "rawValue": { "status": "delivered" }
}
```

Os tipos aceitos são `message_status`, `business_app_echo` e
`coexistence_sync`. Apenas `message_status` atualiza
`whatsapp_message_deliveries`, correlacionando `messageId` com `wamid` e
registrando `sent`, `delivered`, `read` ou `failed` com o timestamp recebido.
Os dois tipos reservados são persistidos de forma idempotente, sem inventar
processamento. `eventKey` é único na tabela
`whatsapp_integration_events`; reenvios retornam `200` com
`alreadyProcessed: true`.

Aplique também a migration
`supabase/migrations/20260730210000_create_whatsapp_integration_events.sql`.
Ela restringe a tabela ao `service_role` e guarda somente o valor bruto
higienizado, removendo campos de credenciais conhecidos.

## Limites desta etapa

O endpoint público `/api/webhooks/whatsapp` continua separado, valida o token
de verificação e a assinatura da Meta, e não recebe tráfego do n8n.

O webhook central do n8n ainda não participa do roteamento. A integração futura
deverá consumir ou encaminhar eventos sem receber Access Token, App Secret,
Authorization ou Service Role.

O envio funcional desta etapa permanece em texto. Mensagens proativas futuras,
especialmente fora da janela de atendimento, devem usar templates previamente
aprovados pela Meta; nenhum template é escolhido ou criado automaticamente.

## Estado operacional validado em 30/07/2026

- As migrations `20260730120000` e `20260730190000` foram aplicadas no projeto
  Supabase de produção.
- A tabela foi validada com Service Role no ciclo `pending` para `accepted`,
  incluindo `wamid`, `accepted_at` e atualização automática de `updated_at`; o
  registro sintético foi removido após o teste.
- O acesso com chave anônima foi recusado e nenhuma chave legada do WhatsApp
  permaneceu em `notification_settings`.
- `WHATSAPP_GRAPH_API_VERSION=v25.0` e
  `WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS=false` foram configuradas na Vercel para
  Development, Preview e Production.
- O commit `286134e` foi publicado em produção pelo deployment
  `dpl_FGi4L6SEHonkpR6EeY8fYgCM3xNH` e associado aos domínios canônicos.
- A saúde da API respondeu `200`; webhook com Verify Token inválido respondeu
  `403`; webhook POST sem App Secret respondeu `503`; e o endpoint de teste sem
  autenticação respondeu `401`.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET` e `WHATSAPP_WEBHOOK_VERIFY_TOKEN` ainda precisam ser
  obtidas na Meta e configuradas como valores protegidos. Enquanto estiverem
  ausentes, o canal retorna `not_configured` e não simula sucesso.
