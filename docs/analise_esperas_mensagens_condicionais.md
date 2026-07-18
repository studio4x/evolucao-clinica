# Análise das esperas das mensagens condicionais

## Resumo executivo

1. **Todas as mensagens podem permanecer como “imediato”?** Não. “Imediato” (`wait_minutes = 0`) não significa envio instantâneo e é aceitável quando o próprio gatilho já contém a janela temporal. É inadequado para processamento pendente, conclusão recente e falhas que ainda precisam de tolerância ou confirmação terminal.
2. **Quais precisam ser alteradas?** As mensagens 1, 5, 15, 16, 17 e 18 precisam de espera adicional ou de um limiar temporal mais explícito. A mensagem 14 precisa de correção do gatilho. As mensagens 2, 6 e 7 estão desativadas/removidas da campanha e exigem decisão funcional antes de reativação.
3. **É apenas configuração?** Parcialmente. Os atrasos simples podem ser configurados em `delay_minutes`/`wait_minutes`, mas a arquitetura precisa evoluir para representar ocorrência, retentativa pendente, elegibilidade e revalidação de forma consistente.
4. **Existe risco de envio incorreto ou duplicado?** Sim. Há boas proteções de deduplicação e revalidação, mas ainda há risco de atraso incorreto, sobreposição com passos de sequência, falhas transitórias tratadas como terminais e corrida entre envio e atualização do dispatch.
5. **Ordem de implementação recomendada:** (a) confirmar estado aplicado das migrations e frequência real dos crons; (b) corrigir as quatro mensagens operacionais e o processamento longo; (c) garantir revalidação transacional/atômica; (d) corrigir o gatilho da mensagem 14 e decidir as três mensagens desativadas; (e) aplicar limite de frequência e colisão entre jornadas.

Conclusão principal: a configuração atual não é uniformemente correta. O sistema usa condição temporal + atraso adicional + próximo horário preferencial; portanto, a análise não deve tratar “imediato” como “enviar agora”.

## Como a espera funciona atualmente

Há dois campos distintos:

- `lifecycle_rules.delay_minutes`: atraso adicional da regra. O scheduler só usa esse campo para mensagens condicionais. Quando vale `0`, não há tolerância adicional.
- `lifecycle_steps.wait_minutes`: atraso de um passo da sequência, contado a partir de `started_at`/`enrolled_at`. O valor substituiu o antigo `day_offset` e é usado para calcular `dueAt` da jornada.

Para uma regra condicional, o fluxo atual é:

1. O scheduler recalcula ou lê o estado do usuário.
2. `evaluateKnownRule` determina se a condição já é verdadeira.
3. O scheduler escolhe o candidato de maior prioridade e elimina uma chave de deduplicação já existente.
4. `delay_minutes` é aplicado como `notBefore`.
5. O envio é agendado para o horário preferencial do usuário/campanha, por padrão `08:30`, no primeiro horário disponível após `notBefore`.
6. O worker reivindica o dispatch quando `scheduled_for` vence.
7. O worker recarrega perfil, preferências e estado e revalida parte das condições antes de enviar.

Assim, `delay_minutes = 0` significa **sem espera adicional após a elegibilidade**, não envio no instante do evento. Na prática, a mensagem pode sair na próxima execução do scheduler/worker e no próximo horário preferencial. O intervalo exato depende da configuração externa dos endpoints `/api/cron/schedule-lifecycle` e `/api/cron/process-lifecycle`; não há, nos arquivos analisados, um cron de lifecycle incluído no bootstrap de jobs do `server.ts`.

O sistema não salva uma coluna genérica de `eligible_at`. A elegibilidade é recalculada periodicamente a partir de estado agregado, timestamps de ocorrência e, para processamento longo, da evolução pendente. O dispatch salva `scheduled_for`, `dedupe_key`, estado, tentativas e metadados.

## Arquivos e componentes analisados

Todos os caminhos abaixo são relativos à raiz `C:\PLATAFORMAS VS CODE\EVOLUÇÃO CLINICA\evolucao-clinica`.

- `server/lifecycle/lifecycleTypes.ts`: tipos de regras, passos, candidatos, estado e contexto operacional.
- `server/lifecycle/lifecycleRules.ts`: nomes dos gatilhos, condições temporais, candidatos e prioridades em memória.
- `server/lifecycle/lifecycleScheduler.ts`: avaliação, escolha, deduplicação, cálculo de `scheduled_for`, matrícula e criação do dispatch.
- `server/lifecycle/lifecycleQueue.ts`: claim, worker, revalidação antes do envio, retries, renderização, canais e cooldown pós-envio.
- `server/lifecycle/lifecycleRepository.ts`: leitura/mapeamento do estado, preferências, campanhas, regras e matrícula.
- `server/lifecycle/lifecycleStateService.ts`: leitura e RPC `recalculate_lifecycle_user_state`.
- `server/lifecycle/lifecycleRoutes.ts`: endpoints de cron/admin para agendar, processar e recalcular.
- `server/lifecycle/lifecycleConstants.ts`: prioridades, cooldowns globais e atrasos de retry.
- `supabase/migrations/20260716100000_create_lifecycle_core.sql`: schema de campanhas, passos, regras, matrícula, estado, dispatch, decisões e preferências.
- `supabase/migrations/20260716101000_create_lifecycle_claim_functions.sql`: claim concorrente e recuperação de mensagens presas.
- `supabase/migrations/20260716102000_seed_lifecycle_rules.sql`: regras e valores iniciais de `delay_minutes`/`cooldown_hours`.
- `supabase/migrations/20260716160000_configure_conditional_lifecycle_templates.sql`: campanha condicional e passos com espera inicial zero.
- `supabase/migrations/20260717160000_configure_conditional_lifecycle_templates.sql`: mesma configuração, na versão posterior do histórico de migrations.
- `supabase/migrations/20260717180000_allow_hourly_lifecycle_wait_time.sql` e `20260717200000_repair_lifecycle_wait_minutes_schema.sql`: conversão/garantia do campo `wait_minutes` em minutos.
- `supabase/migrations/20260717190000_disable_conflicting_conditional_rules.sql`: desativa e remove quatro mensagens de ativação conflitantes.
- `supabase/migrations/20260718090000_require_active_subscription_for_inactive_14d.sql`, `20260718091000_require_available_account_for_inactive_7d.sql` e `20260718092000_make_step_14_contextual_and_prioritized.sql`: refinamentos recentes de elegibilidade e prioridade.
- `supabase/migrations/20260718100000_add_four_operational_conditional_messages.sql`: quatro regras operacionais, todas inicialmente com atraso zero.
- `server.ts`: bootstrap de alguns crons existentes; não encontrei nele o agendamento do lifecycle.

## Tabela completa das mensagens

| # | Identificador real | Nome/template atual | Gatilho atual | Espera atual | Semântica real | Revalidação | Risco | Espera recomendada | Alteração necessária | Classificação e justificativa |
|---:|---|---|---|---:|---|---|---|---|---|---|
| 1 | `evolution_processing_too_long` | Sua evolução ainda está em processamento | Existe evolução `processing` ou inclusão `pending`; `delay_minutes=120` funciona como limiar técnico | 0 adicional; 120 min no limiar | Só fica elegível após 120 min desde `updated_at`/`created_at`, depois aguarda horário preferencial | Sim, o scheduler e o worker confirmam que continua pendente | Alto | 135–150 min totais, parametrizados | Configuração; idealmente separar limiar técnico de tolerância | **ADICIONAR ESPERA**. O código já espera 120 min, mas não os 15–30 min adicionais e não distingue toda falha transitória |
| 2 | `linked_record_without_evolution` | Seu prontuário está pronto para a primeira evolução | Prontuário vinculado, nenhuma evolução, `firstRecordLinkedAt >= 24h` | 0 adicional; 24h no gatilho | Imediato após a condição de 24h, no próximo horário | Revalidação existe, mas a regra foi desativada e o passo removido | Médio | 12–24h já está representado; não somar atraso sem necessidade | Decidir reativação e confirmar timestamp por prontuário | **MANTER IMEDIATO, MAS CORRIGIR O GATILHO**. A janela já está no gatilho; a mensagem não está ativa |
| 3 | `trial_expiring_1d` | Seu teste termina amanhã | Trial ativo e faltam entre 0 e 24h | 0 | Envia no próximo horário preferencial dentro da janela | Sim, confirma trial e restante <=24h | Baixo | 0 adicional | Nenhuma, além de manter revalidação | **MANTER IMEDIATO**. A janela de aproximadamente 24h já está no gatilho |
| 4 | `trial_expiring_3d` | Seu período de teste termina em 3 dias | Trial ativo, mais de 24h e no máximo 72h restantes | 0 | Envia no próximo horário preferencial dentro da janela | Sim, confirma restante entre 24h e 72h | Baixo | 0 adicional | Nenhuma, além de manter revalidação | **MANTER IMEDIATO**. O tempo está embutido na condição |
| 5 | `first_evolution_completed` | Sua primeira evolução foi concluída | `evolutionsCount === 1`, primeira conclusão registrada, idade até 72h | 0 | Poderia sair na primeira execução após a conclusão; não há mínimo de 5–15 min | Sim, confirma exatamente uma evolução concluída | Alto | 5–15 min após conclusão | Configuração de `delay_minutes` e garantia de evento/ocorrência | **ADICIONAR ESPERA**. A condição evita antigas conclusões, mas não dá tempo para leitura/estabilização; regra hoje está desativada |
| 6 | `patient_without_linked_record` | Seu paciente já está cadastrado. Falta o prontuário | Há paciente, nenhum prontuário vinculado, `firstPatientAt >= 24h` | 0 adicional; 24h no gatilho | Imediato após 24h, no próximo horário | Revalidação existe, mas a regra foi desativada e o passo removido | Médio | 12–24h já representadas | Decidir reativação e validar granularidade por paciente | **MANTER IMEDIATO, MAS CORRIGIR O GATILHO**. A janela é adequada; o estado agregado pode não identificar qual paciente está pendente |
| 7 | `logged_in_without_patient` | Falta apenas o primeiro paciente para começar | Login existente, zero pacientes e pelo menos 24h desde login | 0 adicional; 24h no gatilho | Imediato após 24h, no próximo horário | Revalidação existe, mas a regra foi desativada e o passo removido | Médio | 24h já representadas | Decidir reativação e confirmar compatibilidade com e-mail de boas-vindas | **MANTER IMEDIATO, MAS CORRIGIR O GATILHO**. Não há motivo técnico para somar outra espera se a condição de 24h for a desejada |
| 8 | `no_return_after_registration` | Sua conta está pronta para continuar | Sem novo login, pelo menos 24h após onboarding/atividade; worker também exige boas-vindas confirmada | 0 adicional; 24h no gatilho | Imediato após a janela, no próximo horário | Sim, verifica conta ativa, login, e-mail de boas-vindas e ações realizadas | Baixo | 24h já representadas | Nenhuma urgente; confirmar definição comercial de “liberação” | **MANTER IMEDIATO**. O gatilho contém a tolerância necessária |
| 9 | `subscriber_low_usage` | Vamos aproveitar melhor sua assinatura? | Assinante ativo com baixo uso por pelo menos 7 dias | 0 adicional; 7 dias no gatilho; cooldown de 96h após envio | Imediato ao completar 7 dias, no próximo horário | Sim, confirma assinatura, cancelamento, problemas técnicos e atividade | Baixo | 7 dias no gatilho e cooldown 96h | Aplicar limite semanal explicitamente | **MANTER IMEDIATO**. A condição temporal é suficiente, mas o limite de frequência deve ser garantido |
| 10 | `trial_recovery_2d` | Continue de onde você parou | Sem assinatura e pelo menos 2 dias após o dispatch de trial encerrado | 0 adicional; 2 dias no gatilho de revalidação | Imediato após a janela de recuperação | Sim, exige trial encerrado, mensagem anterior enviada, conta válida e preferências ativas | Baixo | 2 dias já representados | Nenhuma urgente | **MANTER IMEDIATO**. O período é pós-condição, não atraso ausente |
| 11 | `trial_recovery_7d` | O que impediu você de continuar? | Sem assinatura e pelo menos 7 dias após o dispatch de trial encerrado | 0 adicional; 7 dias no gatilho de revalidação | Imediato após a janela de recuperação | Sim, pelos mesmos controles da recuperação | Baixo | 7 dias já representados | Nenhuma urgente | **MANTER IMEDIATO**. Deve continuar sujeito a cooldown e descadastro comercial |
| 12 | `inactive_14d` | Algo dificultou o uso da plataforma? | Inatividade >=14 dias; refinamentos exigem conta ativa, assinatura ativa e ausência de problema técnico | 0; 14 dias no gatilho | Imediato ao completar a janela, no próximo horário | Sim, inclui assinatura, cancelamento, problemas técnicos e última atividade | Baixo | 14 dias já representados | Confirmar que a regra aplicada é a migration mais recente | **MANTER IMEDIATO**. A janela está no gatilho; prioridade deve ficar abaixo das ações específicas |
| 13 | `inactive_7d` | Retome seus registros no seu ritmo / A semana ficou corrida? | Inatividade >=7 e <14 dias, conta disponível | 0; 7 dias no gatilho | Imediato ao completar 7 dias, no próximo horário | Sim, confirma retorno, disponibilidade e ausência de alerta técnico | Médio | 7 dias já representados | Garantir colisão com mensagem de 3 dias e máximo semanal | **MANTER IMEDIATO**. A espera temporal está correta, mas pode sobrepor outras mensagens |
| 14 | `inactive_3d` | Seu próximo passo no Evolução Clínica | Inatividade >=3 e <7 dias; atualmente é um gatilho genérico de inatividade | 0; 3 dias no gatilho | Imediato após 3 dias sem acesso | Sim, confirma estado e próxima ação em parte do fluxo | Médio | 48–72h após uma etapa específica pendente | Regra/estado contextual; não apenas `lastActivityAt` | **MANTER IMEDIATO, MAS CORRIGIR O GATILHO**. O intervalo de 3 dias é próximo do desejado, mas não prova que uma etapa específica continua pendente |
| 15 | `evolution_processing_failed` | Não foi possível concluir sua evolução | Status `transcription_status=failed`, recurso identificado; migration descreve falha terminal | 0 | Elegível logo que o estado falho aparece; no próximo horário | Sim, confirma que ainda está `failed`, mas não consulta uma flag explícita de retentativa pendente | Alto | 5–10 min após falha terminal confirmada | Regra/arquitetura: terminalidade, retentativa e atraso | **ADICIONAR REVALIDAÇÃO**. Não enviar no primeiro erro se o sistema ainda puder corrigir automaticamente |
| 16 | `evolution_not_added_to_record` | Sua evolução precisa ser adicionada ao prontuário | Transcrição concluída e inclusão no Google Docs falha | 0 | Elegível imediatamente após a falha de inclusão | Sim, confirma os dois status, mas não há janela de estabilização | Alto | 10–20 min | Configuração mais estado confiável de retry | **ADICIONAR ESPERA**. Evita alertar antes de uma nova tentativa ou de o resultado ficar disponível |
| 17 | `google_connection_interrupted` | Sua conexão com o Google precisa ser reconectada | `force_google_disconnect=true` e conta ativa | 0 | Elegível assim que a flag aparece; `updated_at` também serve como ocorrência | Sim, confirma flag e status da conta | Médio/alto | 10–30 min | Configuração e timestamp de ocorrência específico | **ADICIONAR ESPERA**. A flag precisa representar ação necessária, não indisponibilidade transitória |
| 18 | `subscription_payment_failed` | Não foi possível processar seu pagamento | Transação mais recente com `status=failed` | 0 | Elegível logo após a falha, no próximo horário preferencial | Sim, confirma transação ainda falha; não há confirmação explícita de que retries acabaram | Alto | Até 15 min, ou imediatamente se a política comercial exigir ação urgente | Regra/arquitetura: confirmação terminal e política de cobrança | **ADICIONAR REVALIDAÇÃO**. Não afirmar perda/suspensão de acesso sem consultar a regra comercial atual |

## Mensagens em que “imediato” está correto

“Imediato” é tecnicamente compatível, sem atraso adicional, para as mensagens 3, 4, 8, 9, 10, 11, 12 e, com ressalvas de colisão, 13. Nessas mensagens, o intervalo de 1, 3, 7 ou 14 dias já está na condição temporal. As mensagens 2, 6 e 7 também têm uma janela de 24h no código, mas estão desativadas/removidas por migration e não devem ser classificadas como prontas para produção sem decisão de reativação.

Mesmo nesses casos, “imediato” significa “após a condição estar verdadeira, no próximo processamento e horário disponível”, e sempre deve haver revalidação imediatamente antes do envio.

## Mensagens que precisam de espera adicional

- `evolution_processing_too_long`: o limiar atual é 120 minutos, sem os 15–30 minutos de tolerância sugeridos.
- `first_evolution_completed`: não há mínimo após a confirmação; a regra deve esperar 5–15 minutos e permanecer desativada até decidir como coexistirá com a mensagem transacional.
- `evolution_processing_failed`: precisa aguardar confirmação terminal, não apenas `failed` momentâneo.
- `evolution_not_added_to_record`: precisa de 10–20 minutos para permitir retry/estabilização.
- `google_connection_interrupted`: precisa de 10–30 minutos ou de uma ocorrência persistente.
- `subscription_payment_failed`: precisa de até 15 minutos, salvo regra comercial que determine aviso imediato.

## Problemas de revalidação

O fluxo real é parcialmente equivalente ao desejado: candidato identificado → dispatch criado → espera/agendamento → claim → recarga de dados → revalidação → envio. A revalidação existe para processamento longo, quatro mensagens operacionais, ativação, trial e inatividade.

Limitações encontradas:

- A escolha do candidato e a criação do dispatch não formam uma transação única com a revalidação final. O estado pode mudar entre essas etapas.
- Para as mensagens operacionais, a validação confirma status, mas não há campo explícito comum para `automatic_retry_pending`, `terminal_failure_confirmed` ou `user_action_required`.
- O processamento longo consulta `updated_at` como referência temporal. Se um retry atualizar esse campo, a contagem recomeça; isso pode ser correto, mas não é documentado como política.
- A mensagem de conexão usa `professionals.updated_at` como `occurrenceId`, que pode mudar por outras alterações de perfil.
- O pagamento consulta a transação falha, mas não o estado do retry do provedor nem a regra de acesso. O texto contém bloco condicional de status, mas isso não confirma a política comercial.
- A revalidação de algumas mensagens antigas permanece no worker mesmo depois de as regras terem sido desativadas, indicando compatibilidade legada, não necessariamente fluxo ativo.

Classificação: **risco alto** para falha transitória, pagamento e concorrência; **risco médio** para gatilhos agregados de ativação.

## Problemas de prioridade e sobreposição

Há uma ordem numérica coerente para as regras operacionais principais: pagamento `100`, Google `90`, falha de evolução `80` e inclusão pendente `70`. As regras de inatividade foram reduzidas posteriormente para `60`, `50` e `40`, mantendo a prioridade operacional sobre os lembretes genéricos.

O scheduler escolhe apenas um candidato por avaliação usando `chooseHighestPriority`. Isso reduz colisões, mas não implementa uma fila de supressão explícita para mensagens que já estão agendadas. A sequência da Jornada de Ativação também entra na mesma lista de candidatos e pode vencer uma mensagem condicional cuja prioridade seja inferior.

Riscos concretos:

- Um passo de sequência com prioridade `50` pode competir com `inactive_14d` depois que essa regra foi reduzida para `40`.
- O campo `max_messages_per_24h` existe na campanha, mas não é consultado no scheduler/worker.
- Não há regra genérica que bloqueie mensagem comportamental quando existe dispatch operacional pendente/agendado; parte do bloqueio ocorre apenas via estado e prioridade.
- O cooldown de quatro dias para dispatch condicional é atualizado depois do envio. Dois candidatos podem ser criados antes que o primeiro seja enviado, dependendo da frequência do scheduler.
- A campanha `conditional_lifecycle_messages` fornece templates, mas o scheduler exige uma matrícula ativa da campanha `new_user_activation_15d`; matrículas condicionais antigas são suprimidas pela migration de restrição.

A ordem recomendada do prompt é compatível com os valores operacionais, mas deve ser transformada em uma política explícita de colisão e não depender apenas de números dispersos em migrations.

## Problemas de idempotência e frequência

Proteções existentes:

- `lifecycle_dispatches.dedupe_key` é `UNIQUE`.
- `lifecycle_decisions.decision_key` é `UNIQUE` e usa upsert.
- O claim usa RPC e transição condicional de `queued/retry` para `processing`.
- Há até três tentativas, com atrasos configurados de 15 e 120 minutos.
- O processamento longo guarda `processing_evolution_id` e evita alertas repetidos para o mesmo recurso.
- Há mitigação adicional por usuário/assunto nos últimos 30 minutos em `email_deliveries`.

Lacunas:

- Não existe contador ou consulta de máximo semanal para mensagens comportamentais.
- `max_messages_per_24h` é schema/configuração, mas não é aplicado no código encontrado.
- O cooldown efetivo é 96h para condicionais após envio, 24h para sequência e zero para `transactional_bridge`; não há janela de colisão antes da criação do dispatch.
- A chave de algumas condições é diária (`period`), então a mesma condição pode gerar novo candidato em dia seguinte se o dispatch anterior for suprimido/expirar de forma não coberta pelo dedupe.
- O reenvio administrativo usa UUID deliberadamente novo e contorna a deduplicação normal; deve permanecer restrito a admin e ser auditado.

Recomendação inicial compatível com a arquitetura: aplicar um único claim/lock por usuário para a janela de criação, considerar dispatches `queued`, `processing`, `retry` e `sent`, bloquear mensagens comportamentais por 96h após uma condicional e limitar a duas não operacionais por sete dias. Mensagens operacionais só devem ignorar o bloqueio quando a política confirmar que exigem ação imediata.

## Recomendações técnicas

1. Separar no modelo a condição temporal (`eligible_when`) do atraso de tolerância (`delay_minutes`). Hoje `delay_minutes` também funciona como limiar do processamento longo.
2. Adicionar ocorrência e estado de terminalidade para falhas: `occurrence_id`, `failed_at`, `automatic_retry_pending`, `terminal_failure_confirmed`, `requires_user_action` e, quando aplicável, `next_retry_at`.
3. Revalidar atomicamente ou com claim por recurso/usuário imediatamente antes de criar e imediatamente antes de enviar o dispatch.
4. Fazer o worker tratar `scheduled_for` como limite mínimo, mas recalcular elegibilidade e prioridade na hora do envio; se a condição mudou, cancelar/suprimir o dispatch.
5. Aplicar `max_messages_per_24h` e o limite semanal em uma consulta/ função de banco com lock, incluindo mensagens já agendadas.
6. Criar uma política explícita de supressão: pagamento > Google > falha terminal > inclusão pendente > próxima ação > 7 dias > 14 dias.
7. Corrigir `inactive_3d` para depender de uma etapa pendente concreta, e não somente de `lastActivityAt`.
8. Decidir se as mensagens 2, 5, 6 e 7 devem voltar para a campanha. Não reativá-las apenas alterando o template.
9. Confirmar, no ambiente de produção, a frequência dos crons de `schedule-lifecycle`, `process-lifecycle` e `recalculate-lifecycle`; o repositório expõe os endpoints, mas não mostra o agendamento desses três jobs no bootstrap principal.
10. Manter conteúdo financeiro condicionado ao estado real de acesso; não transformar a falha de pagamento em afirmação de suspensão sem validação da regra comercial.

## Plano de alteração sugerido

### Fase 0 — validação operacional

- Verificar quais migrations até `20260718100000` estão aplicadas em produção.
- Consultar a configuração real dos três endpoints de lifecycle e os horários preferenciais.
- Confirmar com produto as políticas de trial, retries, cobrança e reconexão Google.

### Fase 1 — segurança operacional

- Corrigir o processamento longo para incluir tolerância após o limite técnico.
- Adicionar terminalidade/retry às mensagens 15–18.
- Definir atrasos de 5–15, 10–20, 10–30 e até 15 minutos, respectivamente, somente após validação de produto.
- Garantir revalidação e cancelamento quando o estado se recuperar.

### Fase 2 — gatilhos e jornada

- Tornar a mensagem 14 contextual por etapa pendente.
- Decidir a reativação das mensagens 2, 6 e 7.
- Decidir se a mensagem 5 é transacional ou de relacionamento e eliminar a duplicidade com o e-mail de conclusão.

### Fase 3 — colisão e frequência

- Aplicar prioridade e lock de usuário/recurso.
- Implementar `max_messages_per_24h` e limite semanal.
- Suprimir mensagens comportamentais quando houver alerta operacional ativo ou agendado.
- Criar testes de corrida, recuperação antes do envio, retry, duplicidade e colisão.

## Riscos e dependências

- O estado efetivo do banco pode não coincidir com o conjunto de migrations presente no repositório.
- A frequência real do cron não está comprovada pelos arquivos analisados; isso altera a precisão prática de “imediato”.
- A definição de falha terminal depende dos serviços de transcrição, Google e pagamento.
- Os timestamps agregados (`firstPatientAt`, `firstRecordLinkedAt`, `lastActivityAt`) podem não representar corretamente múltiplos pacientes ou múltiplas ocorrências.
- A campanha condicional e a jornada principal têm papéis diferentes; alterar uma sem a outra pode apenas mudar o template sem mudar o fluxo de envio.
- Uma mudança nos atrasos exige revisão da UX administrativa, validação de valores em minutos e eventual observabilidade de `eligible_at`/`scheduled_for`.
- O texto da cobrança depende de regras comerciais não confirmadas; este relatório não afirma suspensão automática de acesso.

## Dúvidas que exigem validação

- O “tempo técnico esperado” do processamento é exatamente 120 minutos? A tolerância deve ser fixa ou configurável por tipo de evolução?
- Falha de transcrição, falha de inclusão no Google e falha de pagamento têm retries automáticos ativos? Em que momento são considerados terminais?
- A mensagem “Sua primeira evolução foi concluída” deve ser transacional, push, e-mail de relacionamento ou deve ser removida para evitar duplicidade?
- As mensagens de primeiro paciente, prontuário e primeira evolução desativadas devem ser reativadas na Jornada de Ativação?
- A mensagem 14 deve ser disparada 48–72h após qual etapa específica e qual timestamp representa essa pendência?
- Qual é a frequência efetiva dos crons de lifecycle em produção?
- O limite desejado é realmente 96h entre condicionais, duas mensagens não operacionais por semana e uma mensagem por 24h por campanha?
- Em uma falha de pagamento, a plataforma mantém, limita ou suspende acesso? O template deve refletir exatamente essa política.
- Falhas de conexão Google devem ser tratadas como alerta operacional imediato ou como evento persistente após janela de recuperação?

