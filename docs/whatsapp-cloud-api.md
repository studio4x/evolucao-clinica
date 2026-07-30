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

## Limites desta etapa

O endpoint do webhook valida o token de verificação e a assinatura, mas ainda
não processa eventos de status. A correlação futura deverá usar o `wamid`
armazenado.

O webhook central do n8n ainda não participa do roteamento. A integração futura
deverá consumir ou encaminhar eventos sem receber Access Token, App Secret,
Authorization ou Service Role.

O envio funcional desta etapa permanece em texto. Mensagens proativas futuras,
especialmente fora da janela de atendimento, devem usar templates previamente
aprovados pela Meta; nenhum template é escolhido ou criado automaticamente.
