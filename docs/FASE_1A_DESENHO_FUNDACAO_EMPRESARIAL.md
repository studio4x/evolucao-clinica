# Fase 1A — Desenho técnico da fundação empresarial

**Status:** desenho técnico concluído; implementação de banco e telas não iniciada  
**Branch de trabalho:** `feat/clinicas`  
**Ambiente:** Supabase staging `hwkdwinfckmjoriqxbjk`  
**Produção:** `kvxboovgrrhhttaqinld` (somente referência; não tocado nesta fase)  
**Pré-requisito:** Fase 0.5 operacionalmente concluída

Este documento transforma as decisões da Fase 0 e os ajustes operacionais recebidos antes da Fase 1A em um contrato técnico. Ele não é uma autorização para aplicar migration, criar tabela, habilitar integração, alterar Auth ou publicar funcionalidade.

## 1. Limites preservados

Os seguintes itens são estado encerrado da Fase 0.5 e não serão reconfigurados:

- domínio `https://staging.evolucaoclinica.app.br`, DNS, HTTPS e Deployment Protection;
- projeto Vercel `evolucao-clinica-staging`, com branch de produção `feat/clinicas`;
- Supabase staging e suas URLs Auth já configuradas;
- secrets, variáveis, `PUBLIC_APP_URL` e ref de produção;
- Google/OAuth, que permanece desligado;
- integrações externas, cron, Storage, billing e Plano Clínica, todos deny-by-default;
- inventário read-only de produção e as 148 migrations históricas.

Qualquer incompatibilidade encontrada durante a implementação deverá ser registrada como dependência ou risco e interromper a alteração correspondente antes de tocar infraestrutura.

## 2. Princípios arquiteturais

### 2.1 Uma sessão, vários contextos

O usuário continua autenticado em um único projeto Supabase staging e pode alternar explicitamente entre:

```text
Minha conta
Clínica A
Clínica B
```

O contexto ativo é uma escolha operacional/UX. Não haverá troca de domínio, projeto Supabase ou sessão Auth para mudar de clínica. O frontend pode armazenar o contexto selecionado para navegação, mas isso nunca será autorização.

Toda operação sensível deverá validar conjuntamente:

```text
auth.uid()
+ organização alvo
+ membership ativo
+ papel organizacional
+ capacidade clínica
+ permissão específica
```

Hostname, slug, estado de um componente ou valor enviado pelo navegador não podem conceder acesso.

### 2.2 Identidade do membership

`organization_memberships.professional_id` referenciará `public.professionals(id)`. No modelo atual, `professionals.id` é o mesmo UUID do usuário Auth (`auth.users.id`), com FK existente para `auth.users(id)`.

Essa referência é preferida porque:

- mantém compatibilidade com todas as entidades que já usam `professional_id`;
- permite que o mesmo `auth.uid()` possua várias associações em uma única base;
- evita duplicar credenciais, perfis ou usuários Auth;
- permite resolver dados profissionais e identidade Auth sem uma segunda conta;
- conserva a autoria histórica das evoluções.

Restrições planejadas:

- múltiplas linhas para o mesmo `professional_id` em organizações diferentes são válidas;
- `UNIQUE (organization_id, professional_id)` será aplicado por índice único parcial somente para associações não removidas, conforme a semântica final de status;
- não haverá `UNIQUE (professional_id)` global na tabela;
- a organização e o profissional serão validados no banco, nunca por uma associação criada diretamente pelo cliente.

Exemplo suportado:

```text
auth.uid() = U
professionals.id = U

U → Clínica A → owner
U → Clínica B → manager
U → Clínica C → professional
```

## 3. Modelo lógico proposto

O modelo abaixo é a base para migrations aditivas futuras. Nenhum objeto desta seção foi criado na Fase 1A.

### 3.1 `organizations`

Identidade e estado operacional da clínica.

- `id uuid primary key`;
- razão social, nome fantasia, documento e contatos;
- `operational_status`: `pending_setup`, `active`, `restricted`, `archived`;
- timezone/locale;
- `created_by` referenciando o perfil criador;
- timestamps.

Não armazena senha, token OAuth ou segredo de integração.

### 3.2 `organization_memberships`

Associação entre o perfil profissional existente e a organização.

- `organization_id` e `professional_id` obrigatórios;
- `membership_role`: `owner`, `manager`, `professional`;
- `status`: `active`, `suspended`, `removed`;
- `clinical_access_enabled`;
- `seat_required`, calculado/transacional e não editável pelo frontend;
- ator e timestamps de convite/entrada/suspensão/remoção.

Invariantes:

- pelo menos um owner ativo;
- remoção do último owner somente por transferência transacional;
- `clinical_access_enabled = true` exige licença;
- owner/manager administrativos podem existir sem consumir licença;
- owner/manager com capacidade clínica consomem licença;
- membership de uma organização nunca autoriza outra organização.

### 3.3 `organization_invitations`

Convites de uso único, sem envio automático nesta fase.

- e-mail normalizado;
- papel e capacidade clínica pretendidos;
- `token_hash`, nunca token em claro;
- `pending`, `accepted`, `expired`, `revoked`;
- expiração curta, ator e timestamps;
- referência à organização.

O e-mail do convite é dado de roteamento, não prova de identidade. O aceite exige autenticação e conferência do e-mail autenticado com o e-mail normalizado do convite.

### 3.4 `organization_feature_flags` (somente desenho)

Tabela futura para habilitação por organização, separada do kill switch de ambiente.

- `organization_id`;
- chave estável da funcionalidade;
- `enabled`;
- ator, motivo e timestamps;
- unicidade por organização e chave.

Ausência de linha equivale a desligado. Essa tabela não será criada antes da revisão das políticas RLS.

### 3.5 Referências clínicas futuras

As fases seguintes adicionarão `organization_patients` e `patient_professional_assignments`. A Fase 1A não altera `patients`, `evolutions` ou qualquer entidade clínica existente.

Quando essas tabelas forem implementadas, o contexto de um artefato clínico será gravado na criação e permanecerá imutável. Reatribuição de paciente não altera autoria, assinatura, organização ou histórico.

## 4. Contexto ativo e contrato de API

O cliente poderá enviar um identificador de organização apenas como intenção de contexto. O servidor deverá:

1. obter o usuário por `auth.uid()`;
2. validar que a organização existe e está operacionalmente acessível;
3. localizar membership ativo do usuário nessa organização;
4. derivar papel e capacidade clínica do membership;
5. aplicar a permissão específica da operação;
6. rejeitar contexto ausente, divergente ou pertencente a outra organização.

Nenhum endpoint deve aceitar `professional_id` de autoria, membership de outro usuário ou `organization_id` como valor confiável para gravação. IDs recebidos são apenas candidatos a lookup e devem ser comparados com as relações obtidas no banco.

O seletor de contexto deve limpar estado local inválido, mostrar organização ativa de forma explícita e nunca transportar um contexto de uma sessão para outra sem revalidação.

## 5. Fluxo seguro de convite e aceite

### 5.1 Emissão

1. owner/manager solicita convite no contexto da organização.
2. O backend normaliza o e-mail e valida papel, estado da organização e licença, quando clínica.
3. Uma transação reserva a licença clínica, se aplicável, com bloqueio contra concorrência.
4. O token puro é entregue apenas ao mecanismo de convite futuro; o banco guarda somente seu hash.
5. O convite é de uso único, expira e pode ser revogado.
6. O envio de e-mail permanece desabilitado na Fase 1A; testes usam token sintético controlado.

### 5.2 Usuário já existente

```text
convite pendente
→ usuário autentica na sessão Supabase staging
→ backend valida hash, expiração, status e e-mail autenticado
→ transação cria/ativa membership
→ convite vira accepted
→ reserva vira active seat, se clínica
```

Não criar novo usuário Auth, não alterar o perfil pessoal e não migrar pacientes, evoluções ou assinatura individual.

### 5.3 Usuário inexistente

```text
convite pendente
→ usuário cria conta no Auth staging
→ confirmação/autenticação produz auth.uid()
→ trigger ou bootstrap cria o perfil profissional necessário
→ backend valida token e e-mail autenticado
→ transação cria membership
→ convite vira accepted
```

A criação da conta não concede membership automaticamente. Se a criação do perfil falhar, o aceite não deve ser confirmado; a rotina precisa ser idempotente e permitir retomada sem duplicar perfil, reserva ou membership.

### 5.4 Regras contra abuso

- não revelar se um e-mail já possui conta;
- não aceitar token expirado, revogado ou reutilizado;
- não permitir troca do e-mail convidado após a emissão;
- rate limit em emissão e aceite;
- auditoria de emissão, tentativa, aceite, expiração e revogação;
- nenhuma mensagem externa real durante a Fase 1A.

## 6. Feature flag em duas camadas

### 6.1 Camada global/ambiente

O kill switch server-side continua desligado por padrão:

```text
CLINIC_FEATURE_ENABLED=false
VITE_CLINIC_FEATURE_ENABLED=false
```

O espelho `VITE_` serve apenas para UX e navegação. O backend e o banco não podem depender dele.

### 6.2 Camada por organização

Quando a tabela de flags existir, a autorização cumulativa será:

```text
ambiente permitido
AND kill switch global ON
AND organization flag ON
AND membership ativo
AND papel/capacidade/permissão válidos
```

Comportamento obrigatório:

```text
global OFF + organization ON  => negado
global ON  + organization OFF => negado
global ON  + organization ON  => avalia membership e permissão
```

RLS/RPC deve negar acesso mesmo que o usuário force rota, componente, payload ou estado local. Membership presente não liga a funcionalidade sozinho.

## 7. RLS e funções de autorização

O desenho deverá preferir políticas direcionadas a `authenticated` com predicados de associação, sem `auth.role()` e sem claims editáveis de `user_metadata`.

Funções futuras, idealmente em schema não exposto:

- `is_organization_member(p_organization_id uuid)`;
- `has_organization_role(p_organization_id uuid, p_roles text[])`;
- `has_clinical_access(p_organization_id uuid)`;
- `is_clinic_feature_enabled(p_organization_id uuid)`.

Requisitos de segurança:

- usar `(select auth.uid())` para evitar avaliação repetida por linha;
- indexar todas as colunas usadas por membership/RLS;
- toda policy de `UPDATE` terá `USING` e `WITH CHECK`;
- funções `SECURITY DEFINER`, se inevitáveis, terão `search_path` fixo, checagem explícita de `auth.uid()` e `EXECUTE` mínimo;
- não criar funções privilegiadas no schema público como API acidental;
- separar leitura de organização, membro, cadastro de paciente e conteúdo clínico;
- grants de tabela e RLS serão revisados separadamente.

Exemplo conceitual, não executável nesta fase:

```sql
using (
  (select private.is_organization_member(organization_id))
)
with check (
  (select private.is_organization_member(organization_id))
);
```

## 8. Bootstrap do Supabase staging

O banco staging está deliberadamente sem reprodução automática do schema histórico. O bootstrap futuro deverá ser uma operação controlada e revisada, não a execução cega das 148 migrations.

### 8.1 Ordem planejada

1. Confirmar que o alvo é `hwkdwinfckmjoriqxbjk` e que a origem não é produção.
2. Produzir um baseline sanitizado do schema necessário ao fluxo individual, sem dados, Vault, cron, URLs públicas ou secrets.
3. Aplicar apenas o baseline no staging, em janela controlada, com registro de versão.
4. Validar Auth, perfil individual, RLS, Storage vazio e flags desligadas.
5. Aplicar em migration separada somente a fundação empresarial após revisão do baseline.
6. Executar advisors, testes de repetição e matriz de autorização.

### 8.2 Classificação obrigatória das migrations históricas

Antes de qualquer uso, cada migration deverá ser classificada como:

- estrutura/constraints/índices;
- RLS/grants;
- funções/triggers;
- seed de conteúdo;
- cron/`pg_net`/HTTP;
- Vault/secrets;
- integração externa;
- alteração destrutiva ou dependente de dados.

Migrations com cron, `net.http_*`, Vault, Stripe, WhatsApp, n8n, lifecycle, analytics, Meta, Google ou URLs públicas não entram no baseline sem sanitização específica. Nenhuma migration histórica será aplicada nesta Fase 1A.

### 8.3 Guardas do bootstrap

O procedimento deverá falhar antes de qualquer alteração se:

- o ref não for o staging esperado;
- a URL apontar para produção;
- houver service role ausente ou incompatível;
- `APP_ENV`/`VITE_APP_ENV` não forem `staging`;
- alguma integração externa estiver habilitada;
- o Plano Clínica estiver ligado;
- o script detectar comando de cron, Vault ou HTTP não aprovado.

## 9. Matriz mínima de testes antes da implementação

### Contexto e identidade

- um usuário possui memberships em três clínicas sem duplicar Auth/professional;
- troca de contexto não muda sessão nem domínio;
- contexto A não acessa membership, paciente ou flag de B;
- logout/login limpa e revalida contexto.

### Convites

- usuário existente aceita sem nova conta;
- usuário inexistente cria perfil e membership uma única vez;
- token expirado/revogado/reutilizado é rejeitado;
- e-mail autenticado divergente é rejeitado;
- duas aceitações concorrentes não duplicam membership nem licença;
- convite administrativo não reserva assento clínico.

### Flags

- global OFF bloqueia tudo, inclusive organization ON;
- global ON + organization OFF bloqueia;
- apenas global ON + organization ON prossegue para autorização;
- manipulação de frontend não altera o resultado do banco.

### Compatibilidade individual

- login, pacientes e evoluções pessoais permanecem inalterados;
- aceitar convite não migra paciente, evolução ou assinatura pessoal;
- o fluxo individual não requer organização ativa;
- nenhum teste usa dados reais.

## 10. Gates de saída da Fase 1A

A Fase 1A somente poderá ser considerada pronta para implementação quando:

- este desenho for revisado e aprovado;
- o baseline staging sanitizado estiver separado das migrations históricas;
- identidade `professional_id = auth.uid()` estiver confirmada no ambiente alvo;
- matriz de RLS e grants estiver escrita para cada tabela;
- ordem transacional de convite/aceite estiver coberta por testes;
- kill switch global e flag por organização estiverem definidos sem depender do frontend;
- nenhum secret, URL de produção, cron, Vault, Edge Function ou integração externa entrar no bootstrap;
- plano de rollback forward-only estiver documentado;
- nenhum dado real for usado.

## 11. Estado desta entrega

- Documento criado na branch `feat/clinicas`.
- Nenhuma tabela empresarial criada.
- Nenhuma migration aplicada.
- Nenhuma configuração Auth, DNS, Vercel, secret ou integração alterada.
- Nenhuma funcionalidade clínica empresarial habilitada.
- Fase 1A concluída apenas no nível de desenho técnico; a implementação permanece condicionada aos gates acima.
