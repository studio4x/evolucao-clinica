# Relatório da árvore de mudanças — implantação de Clínicas

**Data da auditoria:** 24/09/2026  
**Branch:** `main`  
**Base:** `1df75918` (`main` alinhada com `origin/main`)  
**Objetivo:** registrar os arquivos atualmente presentes na árvore de mudanças para encaminhamento ao agente responsável pela implantação de Clínicas.

## Resumo executivo

No momento da auditoria havia **61 itens de código/documentação relacionados ao conjunto de Clínicas**:

- **3 arquivos rastreados modificados**;
- **58 arquivos não rastreados**;
- aproximadamente **739 KB** de conteúdo não rastreado;
- nenhuma alteração staged antes deste relatório.

O conjunto aparenta ser uma implementação ampla, porém ainda não integrada ao fluxo principal. As telas e rotas novas não estão conectadas ao `src/App.tsx` nem registradas no `server.ts`. Também não há testes específicos acompanhando esse conjunto.

**Recomendação:** não incorporar este conjunto diretamente ao `main`. Preservar os arquivos para uma branch/worktree dedicada à implantação de Clínicas, onde deverão ser revisados, integrados, testados e validados contra o ambiente isolado previsto na documentação do projeto.

## Evidências da auditoria

- `npm run build`: aprovado.
- `npm run lint`: aprovado.
- `git diff --check`: aprovado.
- A aprovação da build não representa integração funcional: o código novo não está roteado pelo aplicativo nem registrado no servidor principal.
- O roadmap empresarial registra a Fase 1 como não iniciada e prevê isolamento em branch, Vercel e Supabase de homologação antes da publicação.
- Não foi executado descarte, alteração de código ou operação remota de banco, Stripe, Vercel ou Supabase.

## 1. Arquivos rastreados modificados

| Arquivo | Estado | Observação |
|---|---|---|
| `server.ts` | Modificado | Adiciona imports de `optionalSupabaseResource`, mas há import duplicado do mesmo módulo. Não registra as novas rotas de Clínicas. |
| `server/admin/professionalCommunicationHistory.ts` | Modificado | Adiciona disponibilidade por canal e tratamento de recurso Supabase opcional; há import duplicado no final do arquivo e nenhum consumidor novo identificado. |
| `server/admin/professionalOverview.ts` | Modificado | Adiciona `usageMetricsAvailable` e fallback para métricas; o novo campo não possui consumidor identificado fora do próprio módulo. |

**Classificação:** alterações parciais associadas ao conjunto de Clínicas. Não devem ser comitadas isoladamente antes da revisão do agente responsável.

## 2. Arquivos não rastreados — backend

| Arquivo | Tamanho aproximado | Função aparente |
|---|---:|---|
| `server/admin/optionalSupabaseResource.ts` | 1,4 KB | Identificação/log de recursos Supabase opcionais. |
| `server/clinic/clinicContextRoutes.ts` | 6,2 KB | Endpoints de contextos da clínica. |
| `server/clinic/clinicEntitlementRoutes.ts` | 4,0 KB | Endpoints de entitlement e acesso clínico. |
| `server/clinic/clinicEvolutionRoutes.ts` | 9,1 KB | Leitura e mutação de evoluções no contexto clínico. |
| `server/clinic/clinicInvitationEmail.ts` | 6,0 KB | Preparação/envio de conteúdo de convite. |
| `server/clinic/clinicInvitationRoutes.ts` | 13,4 KB | Fluxos de criação, reenvio, revogação e aceite de convites. |
| `server/clinic/clinicOperationalRoutes.ts` | 6,7 KB | Dashboard, auditoria e operações de pacientes. |
| `server/clinic/clinicPatientRoutes.ts` | 10,3 KB | CRUD e atribuições de pacientes da clínica. |
| `server/clinic/clinicTeamRoutes.ts` | 6,9 KB | Gestão de membros, papéis e proprietário. |
| `server/clinic/personalPatientGuard.ts` | 1,3 KB | Guarda para separar pacientes pessoais do contexto clínico. |
| `server/supabase/createUserScopedClient.ts` | 0,7 KB | Cliente Supabase com escopo do usuário. |

**Observação:** as funções `registerClinic*Routes` existem, mas não foram registradas no `server.ts` durante esta auditoria.

## 3. Arquivos não rastreados — componentes e páginas frontend

| Arquivo | Tamanho aproximado | Função aparente |
|---|---:|---|
| `src/components/admin/AdminClinics.tsx` | 15,3 KB | Administração de clínicas no painel administrativo. |
| `src/components/clinic/ClinicAccessOptions.tsx` | 3,3 KB | Opções de acesso pessoal/clínica. |
| `src/components/clinic/ClinicContextSelector.tsx` | 4,3 KB | Seletor de contexto ativo. |
| `src/components/clinic/ClinicInvitations.tsx` | 5,2 KB | Lista e ações de convites. |
| `src/components/clinic/ClinicPatientEvolutions.tsx` | 8,1 KB | Evoluções do paciente clínico. |
| `src/components/clinic/ClinicRoute.tsx` | 2,9 KB | Guarda de rota clínica. |
| `src/components/clinic/ClinicalAccessModal.tsx` | 8,7 KB | Modal de acesso clínico. |
| `src/components/clinic/PersonalContextRoute.tsx` | 0,4 KB | Guarda de rota do contexto pessoal. |
| `src/pages/ClinicAudit.tsx` | 6,7 KB | Tela de auditoria da clínica. |
| `src/pages/ClinicBilling.tsx` | 12,5 KB | Tela de cobrança e licenças. |
| `src/pages/ClinicInvitationAccept.tsx` | 11,5 KB | Aceite de convite. |
| `src/pages/ClinicLogin.tsx` | 10,6 KB | Entrada no fluxo de clínica. |
| `src/pages/ClinicNewEvolution.tsx` | 2,3 KB | Criação de evolução clínica. |
| `src/pages/ClinicPatientDetail.tsx` | 13,6 KB | Detalhes do paciente clínico. |
| `src/pages/ClinicPatientForm.tsx` | 7,0 KB | Cadastro/edição de paciente clínico. |
| `src/pages/ClinicPatients.tsx` | 5,6 KB | Lista de pacientes clínicos. |
| `src/pages/ClinicShell.tsx` | 5,7 KB | Layout da área de clínicas. |
| `src/pages/ClinicTeam.tsx` | 24,7 KB | Gestão da equipe clínica. |
| `src/pages/ContextSubscription.tsx` | 1,9 KB | Estado de assinatura no contexto clínico. |

**Observação:** essas páginas não possuem declarações correspondentes nas rotas de `src/App.tsx` durante a auditoria.

## 4. Arquivos não rastreados — serviços, estado e utilitários frontend

| Arquivo | Tamanho aproximado | Função aparente |
|---|---:|---|
| `src/services/clinicBilling.ts` | 3,0 KB | Chamadas de cobrança via Edge Functions. |
| `src/services/clinicContext.ts` | 2,3 KB | Leitura de organizações/contextos. |
| `src/services/clinicEntitlement.ts` | 2,0 KB | Regras e consulta de entitlement. |
| `src/services/clinicEvolutions.ts` | 1,6 KB | Chamadas de evoluções clínicas. |
| `src/services/clinicInvitations.ts` | 2,2 KB | Chamadas de convites. |
| `src/services/clinicOperational.ts` | 3,1 KB | Dashboard e auditoria operacional. |
| `src/services/clinicPatients.ts` | 4,6 KB | Chamadas de pacientes clínicos. |
| `src/services/clinicTeam.ts` | 3,1 KB | Chamadas da equipe clínica. |
| `src/services/evolutionContext.ts` | 1,0 KB | Identificação do contexto da evolução. |
| `src/store/clinicContextStore.ts` | 11,3 KB | Estado global do contexto clínico. |
| `src/utils/clinicAccess.ts` | 1,8 KB | Regras de acesso e caminhos clínicos. |
| `src/utils/clinicAdminPresentation.ts` | 4,7 KB | Labels e apresentação administrativa. |
| `src/utils/clinicContextPresentation.ts` | 0,6 KB | Apresentação do seletor de contexto. |
| `src/utils/clinicEntitlement.ts` | 1,6 KB | Regras de acesso/entitlement no frontend. |
| `src/utils/clinicInvitationAccess.ts` | 1,1 KB | Regras de acesso ao convite. |

## 5. Arquivos não rastreados — Supabase e cobrança

### Migration auxiliar

| Arquivo | Tamanho aproximado | Função aparente |
|---|---:|---|
| `supabase/clinic-migrations/20260921_33_clinic_plan_context_entitlement.sql` | 6,9 KB | Migration auxiliar de plano, contexto e entitlement. |

### Edge Functions

| Arquivo | Tamanho aproximado | Função aparente |
|---|---:|---|
| `supabase/functions/_shared/clinicBilling.ts` | 19,0 KB | Contratos compartilhados de cobrança clínica. |
| `supabase/functions/clinic-billing-cancel/index.ts` | 5,4 KB | Cancelamento de cobrança. |
| `supabase/functions/clinic-billing-catalog/index.ts` | 1,5 KB | Catálogo de planos. |
| `supabase/functions/clinic-billing-seats/index.ts` | 7,3 KB | Alteração de quantidade de licenças. |
| `supabase/functions/clinic-billing-status/index.ts` | 1,4 KB | Consulta do estado de cobrança. |
| `supabase/functions/clinic-stripe-webhook/index.ts` | 5,8 KB | Webhook Stripe da clínica. |
| `supabase/functions/create-clinic-stripe-checkout-session/index.ts` | 15,7 KB | Criação de checkout Stripe da clínica. |

### Migrations principais

| Arquivo | Tamanho aproximado | Função aparente |
|---|---:|---|
| `supabase/migrations/20260924100000_clinic_core_schema.sql` | 98,6 KB | Schema base de organizações, membros e contextos. |
| `supabase/migrations/20260924101000_clinic_entitlements_and_seats.sql` | 73,0 KB | Entitlements, assentos e regras de licença. |
| `supabase/migrations/20260924102000_clinic_billing_and_invitation_security.sql` | 127,4 KB | Cobrança, convites e segurança associada. |
| `supabase/migrations/20260924103000_clinic_patients_and_evolutions.sql` | 82,5 KB | Pacientes, atribuições e evoluções clínicas. |
| `supabase/migrations/20260924104000_clinic_admin_security.sql` | 34,1 KB | Segurança administrativa e correções de acesso. |

**Atenção:** nenhuma dessas migrations deve ser aplicada em produção durante esta triagem. O ambiente isolado, o inventário read-only e os gates de homologação precisam ser confirmados antes da execução.

## 6. Decisão operacional registrada

Este relatório é o único arquivo autorizado para o commit desta tarefa. Os arquivos listados acima permanecem deliberadamente fora do commit para serem avaliados pelo agente da implantação de Clínicas.

O conjunto deve ser tratado como **código de implantação pendente de revisão**, e não como lixo automaticamente descartável: há uma implementação extensa e coerente, mas ela ainda precisa de branch/worktree próprio, integração de rotas, testes, revisão de segurança, validação das migrations e confirmação dos ambientes.

## 7. Próximas verificações recomendadas ao agente de Clínicas

1. Criar ou recuperar uma branch/worktree dedicada, sem misturar com `main`.
2. Conferir se o contrato funcional e o roadmap ainda são a fonte de verdade.
3. Integrar explicitamente as rotas frontend e backend.
4. Remover imports duplicados e revisar consumidores dos novos contratos administrativos.
5. Criar testes unitários, de contrato, RLS e de fluxo completo.
6. Validar as migrations em Supabase isolado, sem usar produção como homologação.
7. Só depois avaliar commit, push e eventual publicação em staging.

