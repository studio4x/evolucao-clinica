# Especificação de Implementação — 4 Novas Mensagens Condicionais

**Projeto:** Evolução Clínica  
**Objetivo:** adicionar quatro mensagens condicionais operacionais para situações que impedem ou interrompem o uso da plataforma.  
**Destinatário:** Codex ou agente responsável pela implementação no repositório.

> Adapte nomes de tabelas, eventos, filas, rotas, componentes e serviços à arquitetura existente. Reutilize o módulo de jornadas, templates, rastreamento, preferências e idempotência já implementado. Não crie estruturas paralelas sem necessidade.

---

## 1. Mensagens a implementar

| Passo | Chave interna | Mensagem | Categoria | Prioridade |
|---:|---|---|---|---:|
| 11 | `evolution_processing_failed` | Falha no processamento da evolução | Operacional | 90 |
| 12 | `evolution_not_added_to_record` | Evolução pronta, mas não adicionada ao prontuário | Operacional | 85 |
| 13 | `google_connection_interrupted` | Conexão com o Google interrompida | Operacional | 95 |
| 14 | `subscription_payment_failed` | Falha no pagamento ou na renovação | Financeira | 100 |

Essas mensagens são operacionais e contextuais. Elas têm prioridade sobre lembretes genéricos de inatividade, retomada e próxima ação.

---

# 2. Regras globais

## 2.1. Revalidação antes do envio

Toda mensagem deve consultar novamente o estado real da conta imediatamente antes do envio.

Cancelar o envio quando:

- o problema já tiver sido resolvido;
- o usuário já tiver concluído a ação recomendada;
- o evento tiver sido revertido ou invalidado;
- o recurso tiver sido excluído;
- a conta tiver sido excluída ou não puder mais acessar o recurso;
- já existir um envio idêntico para a mesma ocorrência.

A condição registrada no momento do agendamento não é suficiente. Ela precisa continuar verdadeira no momento do envio.

## 2.2. Idempotência

Formato recomendado:

```text
{message_key}:{user_id}:{resource_id}:{occurrence_id}
```

Exemplos:

```text
evolution_processing_failed:user_123:evolution_456:failure_001
evolution_not_added_to_record:user_123:evolution_456:append_001
google_connection_interrupted:user_123:connection_789:disconnect_001
subscription_payment_failed:user_123:subscription_987:invoice_001
```

Não gerar um novo envio quando a mesma chave já existir nos estados:

```text
queued
processing
sent
delivered
```

Uma nova mensagem para o mesmo recurso só poderá ser criada quando houver uma nova ocorrência real e identificável.

## 2.3. Colisão e prioridade

Quando duas ou mais mensagens forem elegíveis para o mesmo usuário em uma janela curta:

1. enviar a de maior prioridade;
2. reagendar as demais para nova avaliação;
3. revalidar o estado antes de cada envio;
4. cancelar as que deixarem de ser necessárias.

Janela inicial recomendada:

```text
2 horas
```

Ordem de prioridade:

```text
1. Falha de pagamento ou renovação
2. Conexão Google interrompida
3. Falha no processamento da evolução
4. Evolução não adicionada ao prontuário
5. Próxima ação específica — Passo 10
6. Retomada após 7 dias — Passo 9
7. Investigação após 14 dias — Passo 8
```

## 2.4. Privacidade

Não inserir nos e-mails:

- nome do paciente;
- conteúdo da evolução;
- transcrição;
- diagnóstico;
- informações clínicas;
- detalhes do atendimento;
- tokens, IDs internos ou mensagens técnicas do provedor.

O e-mail deve informar apenas que existe uma ação pendente na conta.

## 2.5. Links e CTAs

Os CTAs devem apontar para rotas autenticadas e seguras da aplicação.

Quando houver redirecionamento para login, preservar a rota de retorno:

```text
/login?redirect=/rota/do/recurso
```

As rotas presentes neste documento são conceituais e devem ser substituídas pelas rotas reais do projeto.

## 2.6. Rastreamento mínimo

Registrar, quando aplicável:

```text
message_key
user_id
resource_id
occurrence_id
trigger_event
eligibility_checked_at
queued_at
sent_at
delivered_at
opened_at
clicked_at
cancelled_at
cancel_reason
provider_message_id
```

Eventos analíticos recomendados:

```text
conditional_message_eligible
conditional_message_queued
conditional_message_cancelled
conditional_message_sent
conditional_message_opened
conditional_message_clicked
conditional_message_action_completed
```

---

# 3. Estrutura conceitual da configuração

Utilizar a estrutura atual do módulo. Caso não exista um tipo equivalente, adotar algo próximo a:

```ts
type ConditionalMessageDefinition = {
  key: string;
  name: string;
  category: "operational" | "billing";
  priority: number;
  subject: string;
  preheader: string;
  triggerEvents: string[];
  idempotencyKey: string;
  templateVariables: string[];
  primaryCta: {
    label: string;
    destination: string;
  };
  secondaryCta?: {
    label: string;
    destination: string;
  };
};
```

Os nomes dos eventos deste documento são conceituais. O Codex deve localizar e utilizar os eventos reais existentes no projeto.

---

# 4. Passo 11 — Falha no processamento da evolução

## 4.1. Identificação

```yaml
key: evolution_processing_failed
category: operational
priority: 80
```

## 4.2. Objetivo

Avisar que uma evolução não pôde ser concluída e orientar o usuário a tentar novamente ou solicitar suporte.

Esta mensagem é diferente de:

- evolução ainda em processamento;
- processamento apenas demorado;
- evolução concluída;
- evolução concluída, mas não adicionada ao prontuário.

## 4.3. Conteúdo do e-mail

**Assunto:**

```text
Não foi possível concluir sua evolução
```

**Preheader:**

```text
Acesse a plataforma para tentar novamente ou solicitar ajuda.
```

**Corpo:**

```markdown
Olá, {{primeiro_nome}}!

Não foi possível concluir o processamento de uma evolução na sua conta.

Acesse o Evolução Clínica para verificar o registro e tentar novamente.

Se a dificuldade continuar, fale com nossa equipe para receber orientação.

A inteligência artificial apoia a transcrição e a organização do conteúdo. A revisão e a responsabilidade pelo registro continuam sendo do profissional.
```

**CTA principal:**

```text
Verificar evolução
```

**Destino conceitual:**

```text
/evolucoes/{{evolution_id}}
```

**CTA secundário:**

```text
Falar com o suporte
```

## 4.4. Eventos de gatilho

Exemplos conceituais:

```text
evolution.processing.failed
evolution.transcription.failed
evolution.generation.failed
```

Usar somente o evento que represente falha terminal ou necessidade de ação do usuário.

## 4.5. Condições de elegibilidade

```text
evolution_id existe
AND user_id existe
AND evolution_status = failed
AND requires_user_action = true
AND automatic_retry_pending = false
AND evolution_deleted = false
AND account_accessible = true
```

Também é válido enviar quando a política interna de tentativas automáticas tiver sido esgotada.

## 4.6. Não enviar quando

```text
evolution_status = processing
OR automatic_retry_pending = true
OR failure_is_transient = true
OR evolution_status = completed
OR evolution_deleted = true
OR user_retried_successfully = true
```

Não enviar no primeiro erro técnico quando existir retentativa automática prevista.

## 4.7. Momento do envio

Agendar somente após:

- confirmação de falha terminal;
- esgotamento das retentativas automáticas; ou
- confirmação de que o usuário precisa executar uma nova ação.

Atraso técnico recomendado:

```text
5 a 10 minutos após a confirmação final da falha
```

## 4.8. Variáveis

```text
{{primeiro_nome}}
{{evolution_id}}
{{support_url}}
```

Não inserir nome do paciente ou conteúdo da evolução.

## 4.9. Idempotência

```text
evolution_processing_failed:{user_id}:{evolution_id}:{failure_occurrence_id}
```

## 4.10. Cancelamento antes do envio

```text
evolution_status = completed
OR evolution_status = processing
OR evolution_deleted = true
OR user_completed_retry = true
```

## 4.11. Critério de sucesso

```text
evolution_status = completed
```

Registrar:

```text
conditional_message_action_completed
message_key = evolution_processing_failed
```

---

# 5. Passo 12 — Evolução pronta, mas não adicionada ao prontuário

## 5.1. Identificação

```yaml
key: evolution_not_added_to_record
category: operational
priority: 70
```

## 5.2. Objetivo

Informar que o processamento foi concluído, mas a evolução ainda não foi incluída no prontuário vinculado.

Esta mensagem só deve existir quando:

- a evolução estiver concluída;
- houver prontuário de destino válido;
- a inclusão tiver falhado ou exigir ação;
- o conteúdo ainda não estiver confirmado no prontuário.

## 5.3. Conteúdo do e-mail

**Assunto:**

```text
Sua evolução está pronta, mas falta adicioná-la ao prontuário
```

**Preheader:**

```text
Acesse a evolução para concluir o registro no prontuário.
```

**Corpo:**

```markdown
Olá, {{primeiro_nome}}!

O processamento da sua evolução foi concluído, mas o registro ainda não foi adicionado ao prontuário.

Acesse a plataforma, confira o conteúdo e tente concluir a inclusão no prontuário.

Antes de utilizar o registro, revise as informações e faça os ajustes necessários.

Caso a dificuldade continue, nossa equipe está disponível para ajudar.
```

**CTA principal:**

```text
Adicionar ao prontuário
```

**Destino conceitual:**

```text
/evolucoes/{{evolution_id}}
```

**CTA secundário:**

```text
Falar com o suporte
```

## 5.4. Eventos de gatilho

Exemplos conceituais:

```text
evolution.record_append.failed
evolution.record_append.action_required
evolution.ready_without_record_append
```

## 5.5. Condições de elegibilidade

```text
evolution_status = completed
AND record_id existe
AND record_link_status = active
AND record_append_status IN (failed, action_required)
AND record_append_confirmed = false
AND evolution_deleted = false
AND account_accessible = true
```

## 5.6. Não enviar quando

```text
record_id não existe
OR record_link_status != active
OR record_append_status = processing
OR automatic_retry_pending = true
OR record_append_confirmed = true
OR evolution_status != completed
OR evolution_deleted = true
```

Quando não existir prontuário vinculado, utilizar a mensagem já existente de configuração do prontuário.

## 5.7. Momento do envio

Enviar somente após:

- falha confirmada na inclusão;
- estado `action_required`; ou
- tempo operacional excedido, desde que não exista retentativa automática pendente.

Atraso recomendado:

```text
10 a 20 minutos após a confirmação do problema
```

## 5.8. Variáveis

```text
{{primeiro_nome}}
{{evolution_id}}
{{support_url}}
```

## 5.9. Idempotência

```text
evolution_not_added_to_record:{user_id}:{evolution_id}:{append_occurrence_id}
```

## 5.10. Cancelamento antes do envio

```text
record_append_confirmed = true
OR record_append_status = completed
OR record_append_status = processing
OR evolution_deleted = true
OR record_link_status != active
```

## 5.11. Critério de sucesso

```text
record_append_confirmed = true
```

Registrar:

```text
conditional_message_action_completed
message_key = evolution_not_added_to_record
```

---

# 6. Passo 13 — Conexão com o Google interrompida

## 6.1. Identificação

```yaml
key: google_connection_interrupted
category: operational
priority: 90
```

## 6.2. Objetivo

Avisar que a conexão com a conta Google precisa ser restabelecida para continuar utilizando os recursos que dependem dessa integração.

Não afirmar que a conta foi invadida, excluída ou desconectada pelo Google sem confirmação.

## 6.3. Conteúdo do e-mail

**Assunto:**

```text
Reconecte sua conta Google para continuar
```

**Preheader:**

```text
A conexão precisa ser restabelecida para utilizar os recursos vinculados ao Google.
```

**Corpo:**

```markdown
Olá, {{primeiro_nome}}!

A conexão entre o Evolução Clínica e sua conta Google precisa ser restabelecida.

Enquanto a conexão estiver interrompida, alguns recursos vinculados ao Google podem não funcionar corretamente, como a criação, a vinculação ou a atualização de prontuários.

Acesse sua conta e faça a reconexão para continuar utilizando esses recursos.

Caso encontre alguma dificuldade, fale com nossa equipe.
```

**CTA principal:**

```text
Reconectar conta Google
```

**Destino conceitual:**

```text
/configuracoes/integracoes/google
```

**CTA secundário:**

```text
Falar com o suporte
```

## 6.4. Eventos de gatilho

Exemplos conceituais:

```text
google.connection.revoked
google.authorization.invalid
google.refresh_token.invalid
google.reconnect.required
```

Erros que podem originar o estado interno:

```text
invalid_grant
token_revoked
authorization_required
```

Não acoplar a regra apenas ao texto bruto do erro. Normalizar os erros do provedor para um estado interno.

## 6.5. Condições de elegibilidade

```text
google_connection_id existe
AND google_connection_status = reconnect_required
AND failure_confirmed = true
AND automatic_recovery_pending = false
AND account_accessible = true
```

## 6.6. Não enviar quando

```text
google_connection_status = active
OR error_is_transient = true
OR automatic_recovery_pending = true
OR provider_outage = true
OR connection_removed_intentionally = true
OR user_no_longer_uses_google_integration = true
```

Quando houver indisponibilidade geral do provedor, utilizar comunicação de incidente, não esta mensagem individual.

## 6.7. Momento do envio

Enviar após a confirmação de que a autorização exige uma nova ação do usuário.

Atraso recomendado:

```text
10 minutos após a confirmação
```

## 6.8. Variáveis

```text
{{primeiro_nome}}
{{support_url}}
```

Não incluir o endereço da conta Google no corpo do e-mail, salvo quando isso já fizer parte da política atual e estiver mascarado.

## 6.9. Idempotência

```text
google_connection_interrupted:{user_id}:{google_connection_id}:{disconnect_occurrence_id}
```

## 6.10. Cancelamento antes do envio

```text
google_connection_status = active
OR connection_removed_intentionally = true
OR automatic_recovery_pending = true
```

## 6.11. Critério de sucesso

```text
google_connection_status = active
```

Registrar:

```text
conditional_message_action_completed
message_key = google_connection_interrupted
```

---

# 7. Passo 14 — Falha no pagamento ou na renovação

## 7.1. Identificação

```yaml
key: subscription_payment_failed
category: billing
priority: 100
```

## 7.2. Objetivo

Informar que uma cobrança ou renovação não foi concluída e orientar o usuário a atualizar o pagamento.

O texto deve refletir o estado real da assinatura. Não afirmar que o acesso foi suspenso quando ainda existir período de tolerância ou nova tentativa automática.

## 7.3. Conteúdo do e-mail

**Assunto padrão:**

```text
Não foi possível concluir o pagamento da sua assinatura
```

**Assunto alternativo para renovação confirmada:**

```text
Não foi possível renovar sua assinatura
```

Usar assunto dinâmico apenas quando o sistema souber diferenciar contratação, cobrança recorrente e renovação.

**Preheader:**

```text
Atualize a forma de pagamento para manter sua assinatura regularizada.
```

**Corpo base:**

```markdown
Olá, {{primeiro_nome}}!

Não foi possível concluir o pagamento da sua assinatura do Evolução Clínica.

Acesse a área de assinatura para verificar a cobrança e atualizar a forma de pagamento.

{{bloco_status_acesso}}

Caso já tenha regularizado a situação, nenhuma ação adicional é necessária.

Se precisar de ajuda, fale com nossa equipe.
```

**CTA principal:**

```text
Atualizar pagamento
```

**Destino conceitual:**

```text
/configuracoes/assinatura
```

**CTA secundário:**

```text
Falar com o suporte
```

## 7.4. Blocos condicionais sobre o acesso

### Acesso ainda ativo durante período de tolerância

```markdown
Seu acesso continua disponível até **{{data_limite_acesso}}**. Regularize o pagamento antes dessa data para evitar a interrupção da assinatura.
```

### Nova tentativa automática agendada

```markdown
Uma nova tentativa de cobrança está prevista para **{{data_proxima_tentativa}}**. Você também pode atualizar a forma de pagamento agora.
```

### Acesso já suspenso

Usar somente quando o estado estiver confirmado:

```markdown
O acesso aos recursos da assinatura está temporariamente suspenso. Após a regularização do pagamento, a conta poderá ser reativada conforme as regras do plano.
```

### Situação sem prazo confiável

```markdown
Consulte a área de assinatura para verificar a situação atual da sua conta.
```

Nunca deixar `{{bloco_status_acesso}}` vazio nem renderizar uma variável sem valor.

## 7.5. Eventos de gatilho

Exemplos conceituais:

```text
billing.payment.failed
billing.renewal.failed
subscription.payment_action_required
invoice.payment_failed
```

Usar o evento interno normalizado pelo sistema de cobrança. Não espalhar regras específicas do provedor por vários módulos.

## 7.6. Condições de elegibilidade

```text
subscription_id existe
AND payment_occurrence_id existe
AND payment_status IN (failed, action_required, past_due)
AND subscription_cancelled_by_user = false
AND payment_resolved = false
AND account_deleted = false
```

## 7.7. Não enviar quando

```text
payment_status = paid
OR payment_resolved = true
OR invoice_voided = true
OR charge_cancelled = true
OR subscription_cancelled_by_user = true
OR occurrence_is_test = true
```

Eventos de sandbox, teste ou simulação não podem gerar e-mails reais.

## 7.8. Momento do envio

Enviar após webhook ou confirmação interna da falha.

Recomendação:

```text
envio inicial = até 15 minutos após a confirmação
```

Não criar sequência adicional de cobrança sem uma especificação separada e aprovada.

## 7.9. Variáveis

```text
{{primeiro_nome}}
{{bloco_status_acesso}}
{{data_limite_acesso}}
{{data_proxima_tentativa}}
{{support_url}}
```

Somente renderizar datas quando existirem e estiverem confirmadas.

## 7.10. Idempotência

```text
subscription_payment_failed:{user_id}:{subscription_id}:{payment_occurrence_id}
```

Cada cobrança ou fatura precisa possuir um identificador de ocorrência próprio.

## 7.11. Cancelamento antes do envio

```text
payment_status = paid
OR payment_resolved = true
OR invoice_voided = true
OR subscription_cancelled_by_user = true
```

## 7.12. Critério de sucesso

```text
payment_status = paid
AND subscription_status IN (active, trialing, valid_equivalent_status)
```

Registrar:

```text
conditional_message_action_completed
message_key = subscription_payment_failed
```

---

# 8. Exemplo consolidado de configuração

O exemplo abaixo é conceitual e deve ser adaptado ao padrão real do projeto.

```ts
export const newConditionalMessages = [
  {
    key: "evolution_processing_failed",
    name: "Falha no processamento da evolução",
    category: "operational",
    priority: 80,
    subject: "Não foi possível concluir sua evolução",
    preheader:
      "Acesse a plataforma para tentar novamente ou solicitar ajuda.",
    triggerEvents: [
      "evolution.processing.failed",
      "evolution.transcription.failed",
      "evolution.generation.failed",
    ],
    idempotencyKey:
      "evolution_processing_failed:{user_id}:{evolution_id}:{failure_occurrence_id}",
    primaryCta: {
      label: "Verificar evolução",
      destination: "/evolucoes/{evolution_id}",
    },
    secondaryCta: {
      label: "Falar com o suporte",
      destination: "{support_url}",
    },
  },
  {
    key: "evolution_not_added_to_record",
    name: "Evolução pronta, mas não adicionada ao prontuário",
    category: "operational",
    priority: 70,
    subject:
      "Sua evolução está pronta, mas falta adicioná-la ao prontuário",
    preheader:
      "Acesse a evolução para concluir o registro no prontuário.",
    triggerEvents: [
      "evolution.record_append.failed",
      "evolution.record_append.action_required",
    ],
    idempotencyKey:
      "evolution_not_added_to_record:{user_id}:{evolution_id}:{append_occurrence_id}",
    primaryCta: {
      label: "Adicionar ao prontuário",
      destination: "/evolucoes/{evolution_id}",
    },
    secondaryCta: {
      label: "Falar com o suporte",
      destination: "{support_url}",
    },
  },
  {
    key: "google_connection_interrupted",
    name: "Conexão com o Google interrompida",
    category: "operational",
    priority: 90,
    subject: "Reconecte sua conta Google para continuar",
    preheader:
      "A conexão precisa ser restabelecida para utilizar os recursos vinculados ao Google.",
    triggerEvents: [
      "google.connection.revoked",
      "google.authorization.invalid",
      "google.reconnect.required",
    ],
    idempotencyKey:
      "google_connection_interrupted:{user_id}:{google_connection_id}:{disconnect_occurrence_id}",
    primaryCta: {
      label: "Reconectar conta Google",
      destination: "/configuracoes/integracoes/google",
    },
    secondaryCta: {
      label: "Falar com o suporte",
      destination: "{support_url}",
    },
  },
  {
    key: "subscription_payment_failed",
    name: "Falha no pagamento ou na renovação",
    category: "billing",
    priority: 100,
    subject:
      "Não foi possível concluir o pagamento da sua assinatura",
    preheader:
      "Atualize a forma de pagamento para manter sua assinatura regularizada.",
    triggerEvents: [
      "billing.payment.failed",
      "billing.renewal.failed",
      "subscription.payment_action_required",
    ],
    idempotencyKey:
      "subscription_payment_failed:{user_id}:{subscription_id}:{payment_occurrence_id}",
    primaryCta: {
      label: "Atualizar pagamento",
      destination: "/configuracoes/assinatura",
    },
    secondaryCta: {
      label: "Falar com o suporte",
      destination: "{support_url}",
    },
  },
] as const;
```

---

# 9. Integração com os passos 8, 9 e 10

## Passo 8 — investigação após inatividade

```text
Algo dificultou o uso da plataforma?
```

Não enviar quando existir erro técnico ou financeiro conhecido.

## Passo 9 — retomada leve

```text
Retome seus registros no seu ritmo
```

Não enviar quando houver ação operacional pendente.

## Passo 10 — próxima ação recomendada

```text
Seu próximo passo no Evolução Clínica
```

Pode ser usado quando existir uma etapa funcional pendente, mas não um erro.

Exemplos adequados:

- cadastrar paciente;
- vincular prontuário;
- criar primeira evolução;
- consultar histórico.

Não utilizar o Passo 10 para substituir alertas de:

- falha de processamento;
- falha ao adicionar ao prontuário;
- desconexão do Google;
- falha de pagamento.

---

# 10. Fluxo de decisão recomendado

```text
1. Existe falha de pagamento?
   SIM → Passo 14
   NÃO → continuar

2. A conexão Google exige nova autorização?
   SIM → Passo 13
   NÃO → continuar

3. Existe evolução com falha terminal de processamento?
   SIM → Passo 11
   NÃO → continuar

4. Existe evolução concluída que não foi adicionada ao prontuário?
   SIM → Passo 12
   NÃO → continuar

5. Existe próxima ação funcional claramente identificada?
   SIM → Passo 10
   NÃO → continuar

6. Usuário está inativo entre 7 e 13 dias?
   SIM → Passo 9
   NÃO → continuar

7. Usuário está inativo há 14 dias ou mais?
   SIM → Passo 8
```

Repetir a validação imediatamente antes do envio.

---

# 11. Testes obrigatórios

## 11.1. Testes unitários

Criar testes para:

- elegibilidade verdadeira;
- elegibilidade falsa;
- revalidação antes do envio;
- idempotência;
- cancelamento após resolução;
- renderização de variáveis;
- ausência de variáveis obrigatórias;
- CTA correto;
- prioridade entre mensagens;
- bloqueio de lembretes genéricos;
- não exposição de dados de pacientes.

## 11.2. Testes de integração

Validar o fluxo:

```text
1. Evento recebido
2. Estado normalizado
3. Mensagem elegível
4. Chave idempotente criada
5. Mensagem agendada
6. Estado reconsultado
7. Template renderizado
8. E-mail enviado
9. Clique rastreado
10. Ação concluída
11. Duplicidade impedida
```

## 11.3. Cenários mínimos

### Falha de processamento

```text
Dado que a evolução falhou de forma terminal
E não existe retentativa automática
Quando o evento for processado
Então a mensagem deve ser agendada
```

```text
Dado que a evolução falhou
Mas foi concluída antes do envio
Então a mensagem deve ser cancelada
```

### Evolução não adicionada

```text
Dado que a evolução foi concluída
E existe prontuário ativo
E a inclusão falhou
Então a mensagem deve ser agendada
```

```text
Dado que não existe prontuário vinculado
Então esta mensagem não deve ser enviada
```

### Google interrompido

```text
Dado que a autorização foi revogada
E a reconexão exige ação do usuário
Então a mensagem deve ser agendada
```

```text
Dado que ocorreu apenas um erro transitório
Então a mensagem não deve ser enviada
```

### Pagamento

```text
Dado que uma cobrança falhou
E ainda não foi regularizada
Então a mensagem deve ser enviada
```

```text
Dado que a cobrança foi paga antes do envio
Então a mensagem deve ser cancelada
```

```text
Dado que existe período de tolerância
Então o e-mail não deve afirmar que o acesso já foi suspenso
```

---

# 12. Critérios de aceite

A implementação será considerada concluída quando:

- as quatro mensagens estiverem cadastradas no módulo existente;
- os templates estiverem disponíveis para visualização;
- os gatilhos estiverem ligados aos eventos reais do sistema;
- cada mensagem possuir revalidação antes do envio;
- a idempotência impedir duplicidades;
- os CTAs levarem às telas corretas;
- nenhuma mensagem expuser dados clínicos ou dados de pacientes;
- erros transitórios não gerarem alertas indevidos;
- os passos 12, 13 e 14 forem suprimidos quando existir mensagem operacional prioritária;
- houver testes automatizados para os cenários principais;
- os logs permitirem identificar elegibilidade, cancelamento, envio e conclusão da ação.

---

# 13. Instruções finais para o Codex

1. Localizar e reutilizar antes de criar novos serviços:
   - serviço de mensagens condicionais;
   - fila de e-mails;
   - mecanismo de templates;
   - controle de preferências;
   - rastreamento de eventos;
   - serviço de assinatura;
   - integração com Google;
   - processamento de evoluções;
   - utilitário de idempotência.

2. Não usar os nomes conceituais dos eventos sem verificar os eventos reais do projeto.

3. Não alterar o comportamento atual de cobrança, Google ou processamento apenas para atender aos e-mails.

4. Não criar promessas sobre segurança, conformidade, proteção legal, armazenamento ou recuperação sem respaldo nas regras existentes.

5. Apresentar a inteligência artificial apenas como apoio à transcrição, organização e redação. A revisão e a responsabilidade permanecem com o profissional.

6. Ao concluir, apresentar:
   - arquivos criados;
   - arquivos alterados;
   - eventos utilizados;
   - regras de elegibilidade;
   - rotas dos CTAs;
   - testes adicionados;
   - limitações ou decisões que dependam de validação.
