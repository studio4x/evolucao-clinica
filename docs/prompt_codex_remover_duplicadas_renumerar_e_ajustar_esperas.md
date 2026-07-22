# Prompt para o Codex — Remoção das mensagens duplicadas, renumeração e ajuste das esperas

Implemente as correções no módulo de mensagens condicionais do **Evolução Clínica** com base na análise técnica já realizada.

## Objetivos

1. Remover definitivamente da jornada condicional as mensagens que estão desativadas por duplicarem comunicações transacionais.
2. Reajustar a numeração das mensagens condicionais restantes.
3. Corrigir as esperas e os gatilhos identificados na análise.
4. Melhorar revalidação, prioridade, colisão, idempotência e limite de frequência onde isso for necessário.
5. Preservar os e-mails transacionais existentes, sem duplicar sua responsabilidade na jornada condicional.

> Antes de alterar qualquer arquivo, inspecione a implementação atual e reutilize os serviços, tabelas, tipos, filas, templates e padrões existentes. Não crie uma segunda arquitetura de lifecycle.

---

# 1. Mensagens que devem ser removidas

Remova da jornada condicional as seguintes mensagens:

| Numeração antiga | Identificador | Motivo |
|---:|---|---|
| 2 | `linked_record_without_evolution` | Duplicada ou coberta por comunicação transacional/fluxo principal |
| 5 | `first_evolution_completed` | Duplicada pela confirmação transacional da evolução concluída |
| 6 | `patient_without_linked_record` | Duplicada ou coberta por comunicação transacional/ativação existente |
| 7 | `logged_in_without_patient` | Duplicada ou coberta por comunicação transacional/ativação existente |

## Regras para a remoção

A remoção deve abranger, conforme a arquitetura real:

- regras em banco;
- passos da campanha;
- templates condicionais;
- registros de configuração;
- enumerações;
- tipos;
- mapas de identificadores;
- prioridade;
- lógica de elegibilidade;
- revalidação no worker;
- seeds;
- telas administrativas;
- filtros;
- previews;
- testes;
- documentação;
- referências por número ou posição.

Não remover os e-mails transacionais equivalentes.

Não excluir histórico de dispatches já enviados. Registros históricos devem continuar legíveis.

Quando as migrations antigas já puderem ter sido aplicadas, **não edite migrations históricas para simular que nunca existiram**. Crie uma nova migration idempotente que:

1. desative as regras antigas;
2. remova os passos ativos da campanha, quando aplicável;
3. preserve histórico;
4. impeça novos agendamentos;
5. cancele ou suprima dispatches futuros ainda não enviados dessas mensagens, se isso puder ser feito com segurança.

Estados sugeridos para dispatches futuros removidos:

```text
cancelled
suppressed
```

Use o estado que já existe no projeto e registre um motivo claro, por exemplo:

```text
conditional_message_removed_as_transactional_duplicate
```

---

# 2. Nova numeração oficial

Após a remoção das quatro mensagens, a jornada condicional deve passar de 18 para **14 mensagens**.

Use a seguinte correspondência:

| Nova numeração | Numeração antiga | Identificador real | Mensagem |
|---:|---:|---|---|
| 1 | 1 | `evolution_processing_too_long` | Sua evolução ainda está em processamento |
| 2 | 3 | `trial_expiring_1d` | Seu período de teste termina amanhã |
| 3 | 4 | `trial_expiring_3d` | Seu período de teste termina em 3 dias |
| 4 | 8 | `no_return_after_registration` | Sua conta está pronta para continuar |
| 5 | 9 | `subscriber_low_usage` | Vamos aproveitar melhor sua assinatura? |
| 6 | 10 | `trial_recovery_2d` | Continue de onde você parou |
| 7 | 11 | `trial_recovery_7d` | O que dificultou sua continuidade? |
| 8 | 12 | `inactive_14d` | Algo dificultou o uso da plataforma? |
| 9 | 13 | `inactive_7d` | Retome seus registros no seu ritmo |
| 10 | 14 | `inactive_3d` | Seu próximo passo no Evolução Clínica |
| 11 | 15 | `evolution_processing_failed` | Não foi possível concluir sua evolução |
| 12 | 16 | `evolution_not_added_to_record` | Sua evolução está pronta, mas falta adicioná-la ao prontuário |
| 13 | 17 | `google_connection_interrupted` | Reconecte sua conta Google para continuar |
| 14 | 18 | `subscription_payment_failed` | Não foi possível concluir o pagamento da sua assinatura |

## Regras da renumeração

- Os identificadores técnicos devem permanecer estáveis sempre que possível.
- Não renomeie chaves internas apenas para refletir a nova posição.
- A numeração deve ser tratada como informação de exibição/ordenação, não como identidade permanente.
- Atualize qualquer `step_order`, `position`, `display_order`, índice visual ou referência documental.
- Evite dependências de negócio baseadas diretamente no número do passo.
- Preserve compatibilidade com histórico e analytics existentes.
- Quando o painel mostrar “Passo X”, ele deve usar a nova numeração.
- Ajuste testes e snapshots que dependam da ordem anterior.

---

# 3. Configuração final das esperas

Aplique a seguinte decisão funcional, validando os nomes reais dos campos.

## 3.1. Mensagens que podem permanecer sem espera adicional

Nestas mensagens, o tempo já está incorporado ao gatilho. O valor equivalente a `delay_minutes = 0` pode ser mantido:

| Nova numeração | Identificador | Condição temporal esperada |
|---:|---|---|
| 2 | `trial_expiring_1d` | Janela aproximada de 24 horas antes do fim do teste |
| 3 | `trial_expiring_3d` | Janela aproximada de 72 horas antes do fim do teste |
| 4 | `no_return_after_registration` | Pelo menos 24 horas sem retorno após a liberação/boas-vindas |
| 5 | `subscriber_low_usage` | Pelo menos 7 dias de baixo uso ou inatividade |
| 6 | `trial_recovery_2d` | Pelo menos 2 dias após o encerramento do teste |
| 7 | `trial_recovery_7d` | Pelo menos 7 dias após o encerramento do teste |
| 8 | `inactive_14d` | Pelo menos 14 dias de inatividade |
| 9 | `inactive_7d` | Entre 7 e 13 dias de inatividade |

Nesses casos, “imediato” deve significar:

```text
sem atraso adicional depois que a condição temporal se torna verdadeira
```

O envio ainda deve respeitar:

- scheduler;
- worker;
- horário preferencial;
- revalidação;
- prioridade;
- limite de frequência;
- deduplicação.

---

## 3.2. Mensagem 1 — processamento prolongado

### Identificador

```text
evolution_processing_too_long
```

### Configuração desejada

O limiar técnico atual identificado foi de aproximadamente 120 minutos.

A mensagem deve ficar elegível somente após:

```text
tempo técnico esperado
+
tolerância adicional de 15 a 30 minutos
```

Implementação recomendada:

```text
limiar técnico = 120 minutos
tolerância adicional inicial = 20 minutos
tempo total inicial = 140 minutos
```

Caso a arquitetura permita separar os conceitos, prefira:

```text
processing_threshold_minutes = 120
delay_minutes = 20
```

Caso não permita, use um limiar total equivalente, sem confundir isso com o atraso genérico da campanha.

### Revalidação

Antes do envio, confirmar:

```text
evolution_status ainda está em processamento
OR record_append_status ainda está pendente
```

Não enviar quando:

```text
processamento concluído
falha terminal confirmada
registro cancelado
recurso excluído
retentativa atualizou o estado e reiniciou a janela
```

---

## 3.3. Mensagem 10 — próxima ação contextual

### Identificador

```text
inactive_3d
```

O identificador pode ser mantido por compatibilidade, mas a lógica não deve depender somente de três dias sem atividade.

### Problema atual

```text
lastActivityAt >= 3 dias
```

não prova que exista uma etapa específica pendente.

### Nova regra

A mensagem deve ser elegível apenas quando houver uma ação funcional concreta e identificável, como:

```text
nenhum paciente cadastrado
paciente existente sem prontuário vinculado
prontuário vinculado sem evolução concluída
evolução pronta para revisão
outro próximo passo real suportado pelo produto
```

Aguardar aproximadamente:

```text
48 a 72 horas desde o momento em que a etapa ficou pendente
```

Use inicialmente:

```text
72 horas
```

quando não existir validação de produto para um tempo menor.

### Conteúdo dinâmico

A mensagem deve preencher:

```text
{{titulo_proxima_acao}}
{{descricao_proxima_acao}}
{{texto_cta_proxima_acao}}
{{url_proxima_acao}}
```

Apenas ações realmente disponíveis ao usuário podem ser renderizadas.

### Prioridade

Esta mensagem deve ficar abaixo de alertas operacionais e acima dos lembretes genéricos de 7 e 14 dias.

---

## 3.4. Mensagem 11 — falha no processamento da evolução

### Identificador

```text
evolution_processing_failed
```

### Espera

```text
5 a 10 minutos após falha terminal confirmada
```

Use inicialmente:

```text
delay_minutes = 10
```

### Condições obrigatórias

```text
terminal_failure_confirmed = true
automatic_retry_pending = false
requires_user_action = true
evolution_status = failed
```

Caso esses campos não existam, não invente valores silenciosamente. Implemente uma normalização compatível com os estados reais do processamento.

Não enviar no primeiro erro transitório.

Cancelar o dispatch quando a evolução for concluída antes do envio.

---

## 3.5. Mensagem 12 — evolução não adicionada ao prontuário

### Identificador

```text
evolution_not_added_to_record
```

### Espera

```text
delay_minutes = 15
```

Faixa funcional aceita:

```text
10 a 20 minutos
```

### Condições obrigatórias

```text
evolution_status = completed
record_append_status IN (failed, action_required)
record_append_confirmed = false
automatic_retry_pending = false
```

Não enviar quando:

- não houver prontuário vinculado;
- a inclusão ainda estiver em processamento;
- houver nova tentativa automática;
- a inclusão já tiver sido confirmada.

---

## 3.6. Mensagem 13 — conexão Google interrompida

### Identificador

```text
google_connection_interrupted
```

### Espera

```text
delay_minutes = 20
```

Faixa funcional aceita:

```text
10 a 30 minutos
```

### Condições obrigatórias

Enviar apenas quando a integração exigir ação real do usuário:

```text
google_connection_status = reconnect_required
failure_confirmed = true
automatic_recovery_pending = false
```

Não enviar em:

- indisponibilidade geral do Google;
- erro transitório;
- renovação automática ainda em andamento;
- desconexão intencional;
- conexão já restabelecida.

Não use `professionals.updated_at` como identificador da ocorrência quando esse timestamp puder ser alterado por outros dados do perfil. Crie ou reutilize um timestamp/ID específico da interrupção.

---

## 3.7. Mensagem 14 — falha no pagamento

### Identificador

```text
subscription_payment_failed
```

### Espera

Use inicialmente:

```text
delay_minutes = 15
```

A mensagem pode ser antecipada somente quando a política comercial e o provedor indicarem que a ação é imediatamente necessária.

### Condições obrigatórias

```text
payment_status IN (failed, action_required, past_due)
payment_resolved = false
subscription_cancelled_by_user = false
occurrence_is_test = false
```

Também deve existir confirmação de que:

```text
não há retry automático que torne o aviso prematuro
```

### Conteúdo financeiro

O texto deve refletir o estado real:

- acesso ainda ativo;
- período de tolerância;
- próxima tentativa;
- acesso suspenso;
- estado ainda não confirmado.

Não afirmar suspensão quando ela não tiver ocorrido.

---

# 4. Revalidação obrigatória

Toda mensagem deve seguir este fluxo:

```text
1. A condição é identificada
2. A ocorrência é registrada
3. O dispatch é agendado
4. A espera é cumprida
5. O estado é consultado novamente
6. A elegibilidade é confirmada
7. A prioridade é recalculada
8. Os limites de frequência são verificados
9. O envio é realizado ou cancelado
```

A revalidação deve ocorrer imediatamente antes do envio.

Cancelar ou suprimir quando:

- o problema tiver sido resolvido;
- o usuário tiver executado a ação;
- uma mensagem de maior prioridade tiver se tornado elegível;
- a conta não estiver mais disponível;
- o usuário tiver cancelado ou solicitado exclusão;
- a mensagem tiver se tornado inadequada ao estado atual.

---

# 5. Idempotência por ocorrência

A chave deve identificar a ocorrência real, e não apenas o usuário e o dia.

Exemplos:

```text
evolution_processing_failed:{user_id}:{evolution_id}:{failure_occurrence_id}
evolution_not_added_to_record:{user_id}:{evolution_id}:{append_occurrence_id}
google_connection_interrupted:{user_id}:{google_connection_id}:{disconnect_occurrence_id}
subscription_payment_failed:{user_id}:{subscription_id}:{payment_occurrence_id}
```

Não gerar novo dispatch para a mesma ocorrência nos estados:

```text
queued
processing
retry
sent
delivered
```

Uma nova mensagem só poderá ser criada quando houver uma nova ocorrência real.

---

# 6. Prioridade e supressão

A ordem funcional deve ser:

```text
1. subscription_payment_failed
2. google_connection_interrupted
3. evolution_processing_failed
4. evolution_not_added_to_record
5. inactive_3d contextual
6. inactive_7d
7. inactive_14d
```

As mensagens de trial devem respeitar suas próprias janelas, mas não devem suprimir alertas operacionais críticos.

## Regras de colisão

Antes de criar ou enviar uma mensagem comportamental, verificar se existe dispatch operacional:

```text
queued
processing
retry
```

Quando houver, a mensagem comportamental deve ser:

```text
adiada
suprimida
ou cancelada
```

conforme o mecanismo existente.

O scheduler não deve depender apenas da escolha do candidato de maior prioridade na mesma execução. Ele também deve considerar dispatches já agendados.

---

# 7. Limite de frequência

Implemente ou aplique efetivamente os limites existentes.

Configuração inicial:

```text
máximo de 1 mensagem condicional não operacional por 24 horas
máximo de 2 mensagens condicionais não operacionais em 7 dias
intervalo mínimo de 96 horas entre mensagens comportamentais
```

Mensagens operacionais podem ignorar o cooldown comportamental quando:

```text
a falha está confirmada
a mensagem exige ação do usuário
não existe outra mensagem operacional equivalente já pendente
```

Verifique e passe a aplicar o campo existente:

```text
max_messages_per_24h
```

caso ele já faça parte do schema.

A verificação deve considerar mensagens:

```text
queued
processing
retry
sent
```

e deve ser segura contra concorrência.

---

# 8. Migrations

Crie uma nova migration posterior às migrations atuais.

A migration deve ser:

- idempotente;
- reversível quando possível;
- segura para ambientes em que parte das regras já esteja desativada;
- compatível com histórico;
- sem exclusão destrutiva de dispatches enviados.

Ela deve:

1. desativar/remover da campanha as quatro mensagens duplicadas;
2. cancelar/suprimir dispatches futuros dessas mensagens;
3. reajustar a ordem visual das 14 mensagens restantes;
4. atualizar `delay_minutes` das mensagens 11 a 14;
5. ajustar o processamento prolongado;
6. atualizar prioridades quando necessário;
7. manter identificadores técnicos estáveis.

Não altere migrations antigas já aplicáveis.

---

# 9. Interface administrativa

Atualize a interface para:

- exibir 14 mensagens;
- usar a nova numeração;
- não mostrar as quatro mensagens removidas como configuráveis;
- manter histórico identificável;
- mostrar corretamente a espera em minutos, horas ou dias;
- diferenciar:
  - tempo embutido no gatilho;
  - atraso adicional;
  - horário preferencial;
- impedir que “imediato” seja interpretado como envio instantâneo quando existe janela temporal no gatilho.

Sugestão de apresentação:

```text
Condição: 7 dias sem acesso
Espera adicional: nenhuma
Envio: próximo horário permitido
```

Para mensagens operacionais:

```text
Condição: falha terminal confirmada
Espera adicional: 10 minutos
Envio: após revalidação
```

---

# 10. Testes obrigatórios

## 10.1. Remoção e renumeração

Testar que:

- as quatro mensagens removidas não geram candidatos;
- não criam novos dispatches;
- não aparecem na lista ativa;
- dispatches históricos continuam legíveis;
- a nova numeração vai de 1 a 14 sem lacunas;
- os identificadores técnicos permanecem estáveis.

## 10.2. Esperas

Testar:

- condição temporal com atraso zero;
- atraso adicional em minutos;
- cálculo de `scheduled_for`;
- horário preferencial;
- revalidação após a espera;
- cancelamento quando o problema se resolve.

## 10.3. Falhas transitórias

Testar que:

- erro transitório não envia mensagem 11;
- retry pendente não envia mensagens 11, 12, 13 ou 14;
- falha terminal confirmada envia após a espera;
- recuperação antes do envio cancela o dispatch.

## 10.4. Próxima ação contextual

Testar:

- nenhum paciente;
- paciente sem prontuário;
- prontuário sem evolução;
- evolução pronta para revisão;
- ausência de próxima ação válida;
- mudança de etapa antes do envio;
- CTA dinâmico correto.

## 10.5. Prioridade e colisão

Testar que:

- falha de pagamento vence alerta Google;
- alerta Google vence falha de evolução;
- falha de evolução vence inclusão pendente;
- alerta operacional suprime lembrete comportamental;
- dispatch operacional já agendado é considerado;
- somente uma mensagem adequada é criada por janela.

## 10.6. Frequência

Testar:

- máximo por 24 horas;
- máximo em 7 dias;
- cooldown de 96 horas;
- exceção operacional;
- concorrência entre duas execuções do scheduler.

---

# 11. Critérios de aceite

A implementação será considerada concluída quando:

- as quatro mensagens duplicadas estiverem removidas da jornada condicional;
- nenhum novo dispatch puder ser criado para elas;
- a jornada ativa possuir exatamente 14 mensagens;
- a numeração estiver atualizada em banco, backend, painel e testes;
- as mensagens com tempo no gatilho permanecerem sem atraso adicional;
- as mensagens operacionais possuírem espera e revalidação adequadas;
- a mensagem 10 for contextual;
- falhas transitórias não gerarem alertas;
- dispatches forem cancelados quando a situação se resolver;
- a prioridade considerar mensagens já agendadas;
- os limites de frequência forem aplicados;
- migrations antigas não forem modificadas;
- todos os testes relevantes estiverem passando.

---

# 12. Entrega esperada do Codex

Ao concluir, apresente:

```markdown
# Resumo da implementação

# Mensagens removidas

# Nova numeração

# Migrations criadas

# Arquivos alterados

# Esperas configuradas

# Gatilhos e revalidações alterados

# Regras de prioridade e frequência

# Testes adicionados ou atualizados

# Compatibilidade com histórico

# Limitações e decisões pendentes
```

Inclua uma tabela final:

| Nova posição | Identificador | Gatilho | Espera adicional | Prioridade | Status |
|---:|---|---|---:|---:|---|

Também informe:

- comandos de teste executados;
- resultado dos testes;
- migrations que precisam ser aplicadas;
- qualquer decisão de produto ainda necessária.

Implemente as alterações. Não apenas produza uma análise.
