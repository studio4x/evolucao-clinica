# Prompt para o Codex — Análise das esperas das mensagens condicionais

Analise a implementação atual do módulo de mensagens condicionais do **Evolução Clínica** e verifique se a configuração de espera como **“imediato”** está correta para cada mensagem.

## Contexto

Atualmente, todas as mensagens condicionais aparecem configuradas com espera **“imediato”**.

Isso pode estar correto em alguns casos, desde que o próprio gatilho já represente o momento exato de envio. Porém, em outras mensagens, pode ser necessário:

- aguardar algumas horas ou dias;
- permitir que o usuário conclua a ação sem receber uma cobrança imediata;
- evitar avisos sobre falhas transitórias;
- revalidar a condição antes do envio;
- impedir excesso ou sobreposição de mensagens.

## Objetivo da análise

Quero que você verifique como o sistema interpreta atualmente:

```text
espera = imediato
```

Determine se isso significa:

1. enviar imediatamente após o evento que originou a condição;
2. enviar imediatamente depois que a condição temporal se torna verdadeira;
3. enviar na próxima execução do job ou cron;
4. enviar sem qualquer período de tolerância;
5. outro comportamento identificado no código.

Não altere o código nesta etapa. Primeiro, faça uma análise completa e apresente as recomendações.

---

# Mensagens que devem ser analisadas

Use os nomes e identificadores reais encontrados no projeto. A lista abaixo representa a intenção funcional atual.

| Passo | Mensagem | Espera funcional sugerida para validação |
|---:|---|---|
| 1 | Sua evolução ainda está em processamento | Somente após ultrapassar o tempo técnico esperado, com tolerância adicional de 15 a 30 minutos |
| 2 | Seu prontuário está pronto para a primeira evolução | 12 a 24 horas após o prontuário ser vinculado |
| 3 | Seu período de teste termina amanhã | Enviar quando faltar aproximadamente 24 horas; pode ser “imediato” se o gatilho já usar essa janela |
| 4 | Seu período de teste termina em 3 dias | Enviar quando faltar aproximadamente 72 horas; pode ser “imediato” se o gatilho já usar essa janela |
| 5 | Sua primeira evolução foi concluída | 5 a 15 minutos após a confirmação da conclusão e da inclusão no prontuário |
| 6 | Seu paciente já está cadastrado. Agora, prepare o prontuário | 12 a 24 horas após o cadastro, se ainda não houver prontuário |
| 7 | Falta apenas o primeiro paciente para começar | Aproximadamente 24 horas após o primeiro acesso, se nenhum paciente tiver sido cadastrado |
| 8 | Sua conta está pronta para você começar | Aproximadamente 24 horas após a liberação, se o usuário não tiver retornado |
| 9 | Vamos aproveitar melhor sua assinatura? | Após período real de baixo uso ou inatividade, sugerido inicialmente em 7 dias |
| 10 | Continue de onde você parou | 1 a 2 dias após o encerramento do teste, se não houver assinatura |
| 11 | O que dificultou sua continuidade? | 4 a 7 dias após o encerramento do teste, se não houver assinatura |
| 12 | Algo dificultou o uso da plataforma? | Ao completar aproximadamente 14 dias de inatividade |
| 13 | Retome seus registros no seu ritmo | Ao completar aproximadamente 7 dias de inatividade |
| 14 | Seu próximo passo no Evolução Clínica | 48 a 72 horas após uma etapa específica continuar pendente |
| 15 | Não foi possível concluir sua evolução | 5 a 10 minutos após falha terminal confirmada e sem nova tentativa automática |
| 16 | Sua evolução está pronta, mas falta adicioná-la ao prontuário | 10 a 20 minutos após falha confirmada na inclusão |
| 17 | Reconecte sua conta Google para continuar | 10 a 30 minutos após confirmação de que é necessária ação do usuário |
| 18 | Não foi possível concluir o pagamento da sua assinatura | Até 15 minutos após a falha confirmada |

Esses intervalos são referências funcionais e não devem ser aplicados automaticamente sem validar:

- a arquitetura atual;
- os eventos existentes;
- os jobs;
- o significado do campo de espera;
- a disponibilidade dos dados necessários;
- as tentativas automáticas;
- as regras comerciais;
- as mensagens já enviadas por outros módulos.

---

# Pontos obrigatórios da análise

## 1. Localização da implementação

Identifique:

- arquivos responsáveis pelas mensagens condicionais;
- modelo ou schema da jornada;
- campos usados para espera;
- serviço de avaliação das condições;
- serviço de agendamento;
- job, cron ou fila responsável pelos envios;
- rotina de revalidação;
- mecanismo de idempotência;
- controle de prioridade;
- limite de frequência;
- templates e variáveis.

Apresente os caminhos completos dos arquivos relevantes.

## 2. Semântica da espera

Explique exatamente como a espera funciona hoje.

Exemplos de perguntas que devem ser respondidas:

- A espera é contada a partir da criação da conta?
- A espera é contada a partir do evento?
- A espera é contada a partir do momento em que a condição se tornou verdadeira?
- O sistema salva uma data de elegibilidade?
- O sistema recalcula a condição periodicamente?
- Uma mensagem com espera imediata pode ser enviada várias vezes?
- O envio é cancelado quando o estado muda?
- Existe revalidação imediatamente antes do envio?

## 3. Gatilhos temporais versus espera adicional

Diferencie claramente:

```text
condição temporal
```

de:

```text
espera após a condição
```

Exemplo:

```text
dias_sem_acesso >= 7
```

pode permitir espera “imediata”, porque o tempo já está embutido na condição.

Por outro lado:

```text
paciente_cadastrado = true
AND prontuario_inexistente = true
```

pode precisar de uma espera adicional de 12 a 24 horas para não gerar um e-mail logo após o cadastro.

Identifique quais mensagens já possuem o tempo correto no gatilho e quais dependem de uma espera adicional.

## 4. Revalidação

Verifique se o fluxo atual executa:

```text
1. Condição identificada
2. Mensagem agendada
3. Espera configurada
4. Estado consultado novamente
5. Condição confirmada
6. Prioridade verificada
7. Envio realizado ou cancelado
```

Caso não exista revalidação, classifique isso como risco de alta prioridade.

Exemplos de mensagens que não podem ser enviadas sem revalidação:

- paciente já vinculou o prontuário;
- evolução já foi concluída;
- evolução já foi adicionada ao prontuário;
- conta Google já foi reconectada;
- pagamento já foi regularizado;
- usuário já assinou;
- usuário já retomou o uso.

## 5. Falhas transitórias

Verifique se as mensagens operacionais distinguem:

- processamento ainda em andamento;
- processamento demorado;
- falha transitória;
- nova tentativa automática pendente;
- falha terminal;
- necessidade de ação do usuário.

Não recomendar envio imediato para falhas que o sistema ainda pode corrigir automaticamente.

## 6. Sobreposição e prioridade

Analise se o mesmo usuário pode receber, no mesmo período:

- uma mensagem de erro técnico;
- uma mensagem de próxima ação;
- uma mensagem de inatividade;
- uma mensagem de fim de teste;
- uma mensagem financeira.

A prioridade funcional recomendada é:

```text
1. Falha de pagamento
2. Conexão Google interrompida
3. Falha terminal no processamento
4. Evolução não adicionada ao prontuário
5. Próxima ação específica
6. Retomada após 7 dias
7. Investigação após 14 dias
```

Verifique se o sistema já implementa algo equivalente.

## 7. Limite de frequência

Verifique se existe algum controle como:

```text
intervalo mínimo entre mensagens comportamentais
máximo de mensagens por semana
bloqueio de mensagens genéricas quando existe alerta operacional
janela de colisão entre mensagens
```

Caso não exista, apresente uma recomendação compatível com a arquitetura atual.

Referência inicial:

```text
intervalo mínimo entre mensagens comportamentais = 3 dias
máximo de mensagens condicionais não operacionais = 2 por semana
mensagens operacionais = não bloquear quando exigirem ação imediata
```

Não aplique esses valores sem justificar.

---

# Classificação esperada por mensagem

Para cada mensagem, apresente uma linha em uma tabela com:

| Campo | Descrição |
|---|---|
| Identificador real | Chave encontrada no código |
| Nome | Nome exibido no sistema |
| Gatilho atual | Evento ou condição atual |
| Espera atual | Valor configurado |
| Semântica real da espera | Como o código interpreta o valor |
| Revalidação | Existe ou não |
| Risco atual | Baixo, médio, alto ou crítico |
| Espera recomendada | Valor proposto |
| Alteração necessária | Nenhuma, configuração, regra ou arquitetura |
| Justificativa | Motivo técnico e funcional |

---

# Situações em que “imediato” pode estar correto

Considere “imediato” válido quando o gatilho já define o momento exato.

Exemplos:

```text
trial_ends_at entre 23 e 25 horas
```

```text
dias_sem_acesso >= 7
AND mensagem_de_7_dias_ainda_nao_enviada
```

```text
payment_status = failed
AND falha_confirmada = true
AND nova_tentativa_automatica_pendente = false
```

Mesmo nesses casos, deve haver revalidação antes do envio.

---

# Situações em que “imediato” provavelmente está incorreto

Analise com atenção especial:

```text
paciente acabou de ser cadastrado
prontuário acabou de ser vinculado
primeira evolução acabou de ser concluída
conta acabou de ser liberada
etapa funcional acabou de ficar pendente
primeiro erro técnico detectado
falha que ainda possui retentativa automática
```

Nesses casos, o envio instantâneo pode:

- parecer cobrança excessiva;
- chegar antes de o usuário visualizar o resultado;
- avisar sobre uma falha que seria resolvida automaticamente;
- gerar vários e-mails durante a configuração inicial;
- competir com mensagens transacionais da própria ação.

---

# Entrega esperada

Entregue um relatório em Markdown com as seguintes seções:

```markdown
# Resumo executivo

# Como a espera funciona atualmente

# Arquivos e componentes analisados

# Tabela completa das mensagens

# Mensagens em que “imediato” está correto

# Mensagens que precisam de espera adicional

# Problemas de revalidação

# Problemas de prioridade e sobreposição

# Problemas de idempotência e frequência

# Recomendações técnicas

# Plano de alteração sugerido

# Riscos e dependências

# Dúvidas que exigem validação
```

No resumo executivo, responda objetivamente:

1. Todas as mensagens podem permanecer como “imediato”?
2. Quais precisam ser alteradas?
3. O problema é apenas de configuração ou exige mudança no mecanismo?
4. Existe risco de envio incorreto ou duplicado?
5. Qual deve ser a ordem de implementação?

---

# Restrições

- Não altere o código nesta etapa.
- Não crie migrations.
- Não modifique templates.
- Não altere jobs, filas ou cron.
- Não aplique os tempos sugeridos sem verificar o funcionamento real.
- Não invente eventos, colunas ou estados.
- Não assuma que o nome exibido no painel corresponde ao valor salvo.
- Não exponha dados de pacientes nos exemplos.
- Não remova mensagens existentes.
- Não trate falha transitória como falha terminal.
- Não afirme que uma cobrança suspende o acesso sem confirmar a regra atual.

---

# Conclusão esperada

Ao final, apresente uma recomendação para cada mensagem usando uma das classificações:

```text
MANTER IMEDIATO
MANTER IMEDIATO, MAS CORRIGIR O GATILHO
ADICIONAR ESPERA
ADICIONAR REVALIDAÇÃO
ADICIONAR PRIORIDADE
SUBSTITUIR POR OUTRA MENSAGEM
DESATIVAR TEMPORARIAMENTE
EXIGE VALIDAÇÃO ANTES DE DECIDIR
```

Não implemente as alterações até receber aprovação após a análise.
