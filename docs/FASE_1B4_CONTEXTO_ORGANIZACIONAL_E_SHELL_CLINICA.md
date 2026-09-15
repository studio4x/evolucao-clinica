# FASE 1B4 — Contexto Organizacional e Shell de Clínica

## 1. Escopo e limites

A Fase 1B4 foi implementada na branch `feat/clinicas`. O escopo é exclusivamente resolução segura de contexto, seleção explícita e shell de clínica somente leitura. Não foram iniciados convite/UI de lifecycle, administração de membros, billing, seats, Stripe, pacientes ou evoluções compartilhados, Fase 1B5, Fase 2 ou produção.

Produção `kvxboovgrrhhttaqinld` permaneceu intocada. A validação de dados e RLS usa exclusivamente staging `hwkdwinfckmjoriqxbjk`; o runtime local continua separado das credenciais de produção.

## 2. Resolução server-side

Foi criado `GET /api/clinic/contexts` em `server/clinic/clinicContextRoutes.ts`.

- exige Bearer token e identidade real validada por `requireAuth`;
- exige `CLINIC_FEATURE_ENABLED=true` no servidor;
- executa a consulta com o JWT do usuário no PostgREST, respeitando RLS;
- considera apenas membership `active`, organização não arquivada e autorização RLS; `clinical_access_enabled` é retornado como capacidade informativa, não como requisito de contexto;
- não aceita `professional_id` do navegador;
- retorna somente `personal.available` e os campos mínimos da organização: id, nome, nome comercial, status, papel e acesso clínico;
- responde `private, no-store` e não registra tokens, hashes, documentos, contatos ou dados clínicos.

Não houve consulta ampla com `service_role` seguida de filtro em JavaScript e não houve alteração de schema/RLS.

## 3. Cliente e navegação

`useClinicContextStore` é separado do `authStore` e mantém lista, contexto ativo, estado de hidratação, erro, timestamp e usuário. A seleção organizacional é persistida apenas como ID em `sessionStorage` com chave vinculada ao usuário; permissões nunca são persistidas como autoridade.

Login/bootstrap, reload, foreground e troca manual de contexto revalidam a lista. Revogação, resposta 401/403 ou falha de resolução removem o contexto organizacional e retornam ao contexto pessoal sem retries infinitos. Logout e troca de usuário limpam estado e cache da sessão anterior.

O seletor acessível “Contexto atual” oferece “Minha conta” e as clínicas disponíveis em desktop e mobile. Com `VITE_CLINIC_FEATURE_ENABLED=false`, o seletor, menu, rota e badge de clínica ficam ocultos e o fluxo individual permanece igual.

## 4. Shell e guards

`/painel/clinica` possui guard próprio para autenticação pronta, flag pública ativa, contexto carregado e membership ainda autorizado. O shell exibe organização, papel, status e permissão clínica, sem carregar pacientes, evoluções, documentos ou métricas.

Quando uma organização está ativa, a navegação fica mínima e as rotas pessoais de dashboard, pacientes, histórico, tutorial, compartilhamento e migração redirecionam para o shell. A assinatura continua submetida ao `ProtectedRoute` existente; membership não contorna a regra de assinatura. Nenhum `org_id` foi adicionado ao modelo individual.

## 5. Validação

O teste `tests/clinic-context.test.ts` cobre o contrato da rota, uso do JWT no cliente RLS, ausência de identidade fornecida pelo navegador, flag pública, store separado, contexto pessoal padrão, hidratação, seleção explícita, revalidação com revogação, fallback pessoal, logout e isolamento entre usuários.

O push de `62dd42a` gerou deployment `READY` no projeto Vercel staging `evolucao-clinica-staging` do TARGET. A tentativa sem sessão no alias protegido retornou a tela de Deployment Protection em HTML; ela não foi considerada resposta da API. A prova autenticada do contrato foi feita localmente com o código publicado apontando exclusivamente para o banco staging.

Estado read-only do staging após o cleanup da validação:

```text
runtime_environment = staging
clinic_runtime_config.enabled = false
clinic_runtime_config.allowed_environment = staging
organizations = 0
organization_memberships = 0
organization_feature_flags = 0
auth.users = 0
```

Foi executado um smoke controlado com dois usuários e duas organizações sintéticas. Durante o smoke, o gate global foi habilitado somente no staging, a rota local foi apontada para o banco staging e as sessões normais de A/B retornaram exclusivamente seus próprios contextos. O cleanup removeu usuários, organizações, memberships, flags e eventos sintéticos; o gate global voltou a OFF. A suíte local foi executada com sucesso pelos comandos abaixo:

```text
npm run test:environment-isolation
npm run test:clinic-context
npm test
npm run lint
npm run build
git diff --check
```

## 6. Build e próximo passo

A build web exibida no rodapé foi incrementada para `v1.10.868`. Não houve alteração de `PLAY_STORE_VERSION` ou de artefatos Android.

Resultado inicial: **FASE 1B4 APROVADA PARA REVISÃO**.

Este resultado não autoriza Fase 1B5, lifecycle UI, convites, billing, seats, Stripe, pacientes compartilhados, Fase 2 ou qualquer operação em produção.

## 7. Hardening 1B4.1 — Membership vs capacidade clínica

O contexto organizacional agora é derivado da participação válida: membership ativa, organização não arquivada, flags habilitadas e RLS autorizando a linha. `clinical_access_enabled` permanece no payload para informar capacidade clínica, mas não decide se a organização aparece no seletor.

Assim, owner, manager ou professional administrativos podem selecionar a clínica mesmo com `clinicalAccessEnabled=false`; isso não concede acesso a pacientes, evoluções, documentos, atendimento ou assento. Apenas fases futuras poderão usar essa capacidade para liberar recursos clínicos e seats. A assinatura individual continua sob o `ProtectedRoute` existente, sem bypass por membership.

O smoke 1B4.1 cobre owner/manager/professional ativos com capacidade false, professional com capacidade true, memberships suspensas/removidas, histórico `removed + active`, múltiplas clínicas com capacidades mistas e isolamento cross-tenant. O staging foi limpo ao final e permaneceu com gate global OFF.

Resultado: **FASE 1B4 REVISADA E ENDURECIDA — APTO PARA FASE 1B5**.
