# Jornada de Ativação e Relacionamento — Evolução Clínica

**Versão:** 1.1  
**Data da revisão:** 16/07/2026  
**Documento:** Especificação funcional, editorial e de automação  
**Produto:** Evolução Clínica  
**Site:** https://www.evolucaoclinica.app.br  
**Documento técnico relacionado:** `especificacao_tecnica_modulo_jornada_usuarios_evolucao_clinica.md`

---

# 1. Objetivo do documento

Este documento define a jornada de ativação, educação, relacionamento, retenção e conversão para novos usuários do Evolução Clínica.

A versão 1.1 foi revisada de acordo com o funcionamento atual da plataforma e considera:

- o e-mail transacional de boas-vindas já existente;
- a possibilidade de o cadastro depender de aprovação;
- o período de teste atual de 7 dias;
- a necessidade de criar ou vincular um prontuário no Google Docs;
- a criação de evoluções por gravação ou envio de áudio;
- os eventos que podem ser medidos de forma confiável;
- a separação entre a jornada pública existente e a jornada individual dos usuários;
- a necessidade de evitar e-mails duplicados com as notificações atuais da plataforma.

A estratégia combina:

1. um e-mail transacional no Dia 0;
2. uma jornada principal de 15 mensagens;
3. mensagens condicionais baseadas no comportamento;
4. um fluxo comercial ligado ao vencimento real do teste;
5. segmentação por profissão;
6. regras de frequência, prioridade, pausa, substituição e saída;
7. acompanhamento por ações realizadas na plataforma.

O objetivo não é apenas apresentar funcionalidades. A jornada deve levar o usuário a experimentar valor real e perceber como o Evolução Clínica pode apoiar a organização dos registros da sua rotina.

---

# 2. Premissas confirmadas na plataforma

## 2.1. E-mail de boas-vindas existente

A plataforma já envia um e-mail automático quando a conta é criada e liberada.

Esse e-mail deve ser considerado o **Dia 0 transacional**.

A jornada educativa não deve enviar outra mensagem genérica de boas-vindas no mesmo dia.

---

## 2.2. Início da jornada

A jornada deve começar quando a conta estiver apta para uso.

Condição recomendada:

```text
professionals.status = active
```

Caso o cadastro esteja aguardando aprovação, o usuário permanece apenas no fluxo transacional de cadastro pendente.

---

## 2.3. Período de teste

O período de teste atual é de 7 dias.

Por isso:

- os e-mails de conversão não devem depender dos dias 14 e 15;
- os avisos comerciais devem acompanhar `trial_ends_at`;
- a sequência educativa pode continuar após o fim do teste;
- o conteúdo deve ser adaptado se o acesso estiver bloqueado;
- assinantes não devem receber mensagens para contratação.

---

## 2.4. Primeiro fluxo de valor

O fluxo atual necessário para criar uma evolução é:

```text
Cadastrar paciente
↓
Criar ou vincular prontuário no Google Docs
↓
Gravar ou enviar áudio
↓
Processar a transcrição
↓
Adicionar a evolução ao prontuário
```

A jornada deve respeitar essa ordem.

---

## 2.5. Evolução por áudio

O fluxo principal identificado utiliza gravação ou envio de áudio.

Não utilizar, nesta versão, frases que afirmem que o usuário pode criar uma evolução digitando um resumo manual, salvo se essa funcionalidade for confirmada ou implementada posteriormente.

---

## 2.6. Revisão profissional

A comunicação deve orientar o usuário a revisar o conteúdo produzido antes de utilizá-lo.

Entretanto, a plataforma ainda não possui um evento persistente que confirme tecnicamente que a revisão foi realizada.

Portanto:

- a revisão continua sendo uma orientação essencial;
- ela não deve ser utilizada como métrica automática de ativação;
- não afirmar no relatório que o usuário revisou apenas porque a evolução foi concluída.

---

## 2.7. Segmentação

A profissão pode ser obtida por meio de:

```text
professionals.professional_title
```

A segmentação por conta individual ou clínica depende da existência ou criação de um campo específico.

Não inferir que uma conta é clínica pela quantidade de pacientes.

---

# 3. Posicionamento da comunicação

## 3.1. Mensagem central

O Evolução Clínica ajuda o profissional a transformar sua fala em registros clínicos organizados, mantendo o profissional no controle do conteúdo final.

---

## 3.2. Benefícios principais

- menos tempo digitando;
- menor acúmulo de registros;
- prontuários mais organizados;
- transformação de áudio em evolução estruturada;
- histórico mais fácil de consultar;
- continuidade entre atendimentos;
- organização de documentos;
- rotina administrativa mais ágil;
- mais tempo para o cuidado e outras atividades profissionais.

---

## 3.3. Cuidados de comunicação

Não afirmar que a plataforma:

- substitui o profissional;
- realiza diagnóstico;
- define condutas;
- elimina erros;
- dispensa revisão humana;
- interpreta clinicamente o caso;
- garante conformidade com conselhos profissionais;
- é automaticamente adequada a todas as profissões;
- possui proteção jurídica garantida;
- é 100% segura;
- está automaticamente adequada à LGPD;
- oferece criptografia ou proteção específica sem validação técnica;
- permite compartilhamento entre profissionais sem confirmação das permissões existentes.

Sempre reforçar, quando pertinente, que a inteligência artificial apoia a organização e a redação, enquanto a revisão e a responsabilidade continuam sendo do profissional.

---

# 4. Objetivos da jornada

A jornada deve contribuir para:

- fazer o usuário retornar depois da liberação da conta;
- concluir o onboarding inicial;
- estimular o cadastro do primeiro paciente;
- orientar a criação ou vinculação do prontuário;
- incentivar a primeira evolução por áudio;
- melhorar a qualidade do resumo falado;
- reforçar a necessidade de revisão;
- apresentar o histórico do paciente;
- mostrar aplicações práticas na rotina;
- apresentar recursos complementares;
- formar hábito;
- recuperar usuários inativos;
- identificar dificuldades;
- conduzir à assinatura;
- aumentar o uso após a assinatura;
- reduzir cancelamentos por falta de ativação.

---

# 5. Definição de usuário ativado

## 5.1. Ativação tecnicamente mensurável

O usuário será considerado **ativado** quando:

1. possuir pelo menos um paciente cadastrado;
2. possuir pelo menos um prontuário do Google Docs vinculado;
3. concluir pelo menos uma evolução;
4. a transcrição estiver concluída;
5. a evolução tiver sido adicionada ao prontuário.

---

## 5.2. Níveis de ativação

### Nível 0 — Conta ativa

- cadastro liberado;
- ainda não retornou ou não concluiu ações relevantes.

### Nível 1 — Primeiro acesso

- realizou login após a ativação;
- começou o onboarding.

### Nível 2 — Primeiro paciente

- cadastrou pelo menos um paciente;
- ainda não vinculou o prontuário.

### Nível 3 — Prontuário vinculado

- criou ou vinculou o documento do Google;
- ainda não concluiu evolução.

### Nível 4 — Primeira evolução concluída

- concluiu uma evolução;
- transcrição e inclusão no prontuário concluídas.

### Nível 5 — Uso recorrente

- criou evoluções em mais de um dia;
- possui pelo menos três evoluções;
- retornou à plataforma.

### Nível 6 — Uso avançado

- utiliza recursos adicionais;
- gera documentos;
- utiliza relatórios;
- configura backup;
- solicita migração;
- utiliza outros recursos disponíveis no plano.

---

## 5.3. Revisão humana

A revisão do registro deve ser reforçada editorialmente, mas não integra a ativação automática enquanto não houver uma ação explícita de confirmação na plataforma.

---

# 6. Arquitetura da comunicação

## 6.1. Dia 0 — Mensagem transacional

Enviada automaticamente pela plataforma quando a conta é criada ou liberada.

Não conta como uma das 15 mensagens educativas.

---

## 6.2. Jornada principal

A jornada contém 15 mensagens educativas.

Ela pode ser concluída em até 25 dias, porque:

- mensagens condicionais podem substituir o envio planejado;
- a jornada pode ser pausada;
- conteúdos obsoletos podem ser ignorados;
- o limite é de um e-mail de relacionamento a cada 24 horas.

---

## 6.3. Mensagens condicionais

São disparadas conforme o comportamento real.

Exemplos:

- não retornou;
- não cadastrou paciente;
- paciente sem prontuário;
- prontuário sem evolução;
- evolução com erro ou processamento pendente;
- primeira evolução concluída;
- inatividade;
- teste próximo do fim;
- assinatura concluída.

---

## 6.4. Fluxo comercial do teste

O fluxo de teste acompanha `trial_ends_at`.

Ele pode substituir o e-mail educativo quando tiver prioridade maior.

---

## 6.5. Jornada de assinantes

Quando o usuário assina:

- mensagens comerciais pendentes são canceladas;
- a jornada educativa pode continuar;
- os e-mails dos dias finais são adaptados;
- o usuário pode entrar em um fluxo de adoção e retenção.

---

# PARTE I — DIA 0 TRANSACIONAL

# 7. Dia 0 — Conta criada ou acesso liberado

**Tipo:** transacional  
**Origem:** sistema existente  
**Objetivo:** confirmar que a conta está pronta e permitir o primeiro acesso.  
**Conta na jornada:** não  
**CTA:** `Acessar a plataforma`

## Regra

Não enviar outro e-mail de boas-vindas no mesmo período de 24 horas.

## Próximo envio

Agendar a primeira mensagem educativa aproximadamente 24 horas após a ativação da conta, respeitando o horário configurado.

---

# PARTE II — JORNADA PRINCIPAL DE 15 MENSAGENS

# 8. Visão geral

| Mensagem | Tema | Objetivo principal | Ação esperada |
|---:|---|---|---|
| 1 | Comece por uma ação simples | Fazer o usuário retornar | Acessar a plataforma |
| 2 | Primeiro paciente | Iniciar a organização | Cadastrar paciente |
| 3 | Prontuário no Google Docs | Preparar o paciente para evoluções | Criar ou vincular prontuário |
| 4 | Primeira evolução por áudio | Entregar a primeira percepção de valor | Concluir evolução |
| 5 | Como preparar um bom resumo | Melhorar a experiência | Gravar novo resumo |
| 6 | A IA organiza, você revisa | Reforçar controle profissional | Revisar um registro |
| 7 | Histórico do paciente | Mostrar continuidade | Consultar histórico |
| 8 | Registro entre atendimentos | Inserir o produto na rotina | Registrar após atendimento |
| 9 | Registros acumulados | Trabalhar dor real | Retomar um registro |
| 10 | Fechamento do dia | Formar hábito | Conferir registros |
| 11 | Documentos e relatórios | Ampliar valor percebido | Conhecer área disponível |
| 12 | Dúvidas sobre IA | Quebrar objeções | Utilizar novamente |
| 13 | Recurso adicional | Apresentar funcionalidade relevante | Explorar um recurso |
| 14 | Progresso e próxima ação | Reconhecer avanço | Executar recomendação |
| 15 | Continuidade | Consolidar uso | Continuar, assinar ou explorar |

---

# 9. Mensagem 1 — Comece por uma ação simples

**Categoria:** ativação  
**Objetivo:** fazer o usuário retornar à plataforma.  
**Ação esperada:** acessar a conta e continuar o onboarding.  
**CTA principal:** `Continuar configuração`

## Assuntos sugeridos

1. Seu próximo passo no Evolução Clínica
2. Vamos começar pela primeira ação?
3. Sua conta já está pronta

## Preheader

Acesse sua conta e continue de onde parou.

## Conteúdo-base

Olá, {{primeiro_nome}}!

Sua conta no Evolução Clínica está pronta.

Nos próximos dias, você receberá orientações rápidas para conhecer os principais recursos da plataforma e entender como eles podem apoiar sua rotina de registros.

Você não precisa configurar tudo de uma vez.

O objetivo de hoje é apenas acessar a plataforma e continuar a primeira etapa do onboarding.

**CTA:** Continuar configuração

## Regra de adaptação

Se o usuário já tiver retornado, direcionar para a próxima ação incompleta:

- cadastrar paciente;
- vincular prontuário;
- criar evolução;
- concluir onboarding.

---

# 10. Mensagem 2 — Cadastre o primeiro paciente

**Categoria:** ativação  
**Objetivo:** iniciar a estrutura de organização.  
**Ação esperada:** cadastrar pelo menos um paciente.  
**CTA principal:** `Cadastrar primeiro paciente`

## Assuntos sugeridos

1. Comece pelo seu primeiro paciente
2. A organização começa com um cadastro
3. Prepare seu primeiro prontuário

## Preheader

Cadastre um paciente para iniciar a organização dos registros.

## Conteúdo-base

Olá, {{primeiro_nome}}!

O cadastro do paciente é o primeiro passo para reunir evoluções, históricos e documentos.

Comece com apenas um paciente para conhecer o funcionamento da plataforma.

Depois do cadastro, a próxima etapa será criar ou vincular o prontuário desse paciente no Google Docs.

**Desafio de hoje:** cadastre seu primeiro paciente.

**CTA:** Cadastrar primeiro paciente

## Regra de exclusão

Se o usuário já possuir paciente, não enviar.

Substituir pela próxima ação:

- vincular prontuário;
- criar evolução;
- consultar histórico.

---

# 11. Mensagem 3 — Crie ou vincule o prontuário

**Categoria:** ativação  
**Objetivo:** preparar o paciente para receber evoluções.  
**Ação esperada:** criar ou vincular o documento do Google Docs.  
**CTA principal:** `Configurar prontuário`

## Assuntos sugeridos

1. Prepare o prontuário do seu paciente
2. Falta uma etapa antes da primeira evolução
3. Conecte o prontuário ao Evolução Clínica

## Preheader

Crie ou vincule um documento no Google Docs para continuar.

## Conteúdo-base

O paciente já está cadastrado.

Agora, crie ou vincule o prontuário no Google Docs.

Essa conexão permite que as evoluções concluídas sejam organizadas no documento do paciente.

Depois dessa etapa, você poderá gravar seu primeiro resumo e experimentar o fluxo completo.

**CTA:** Configurar prontuário

## Regra de exclusão

Não enviar se o usuário já possuir pelo menos um paciente com `google_doc_id`.

---

# 12. Mensagem 4 — Primeira evolução por áudio

**Categoria:** ativação  
**Objetivo:** entregar a principal percepção de valor.  
**Ação esperada:** concluir a primeira evolução.  
**CTA principal:** `Criar primeira evolução`

## Assuntos sugeridos

1. Transforme sua fala em uma evolução
2. Experimente seu primeiro registro por áudio
3. Fale, processe e organize

## Preheader

Grave um resumo e veja como ele pode ser organizado no prontuário.

## Conteúdo-base

Agora que o paciente possui um prontuário vinculado, chegou o momento de experimentar uma das principais propostas do Evolução Clínica.

Grave ou envie um resumo em áudio com os pontos principais do atendimento.

A inteligência artificial apoiará a transcrição e a organização da redação, e o resultado será adicionado ao prontuário do paciente.

Antes de utilizar o conteúdo, confira se ele representa corretamente o atendimento e faça os ajustes necessários.

**CTA:** Criar primeira evolução

## Regra de exclusão

Não enviar se o usuário já concluiu uma evolução.

---

# 13. Mensagem 5 — Como preparar um bom resumo falado

**Categoria:** educação  
**Objetivo:** melhorar a experiência com áudio.  
**Ação esperada:** criar uma nova evolução com fala organizada.  
**CTA principal:** `Gravar um resumo`

## Assuntos sugeridos

1. Um resumo simples já é suficiente
2. Como gravar um áudio mais claro
3. Você não precisa falar de forma perfeita

## Preheader

Uma estrutura simples ajuda a organizar melhor o registro.

## Conteúdo-base

Você não precisa preparar um discurso perfeito.

Uma maneira simples de organizar sua fala é mencionar:

1. o contexto ou objetivo do atendimento;
2. os principais pontos observados;
3. as atividades, intervenções ou temas abordados;
4. a resposta apresentada;
5. as orientações ou próximos passos.

Fale de forma natural e confira o conteúdo depois do processamento.

Com o uso, você encontrará o formato que melhor se adapta à sua rotina e à sua profissão.

**CTA:** Gravar um resumo

---

# 14. Mensagem 6 — A IA organiza, você revisa

**Categoria:** educação e confiança  
**Objetivo:** reforçar o controle profissional.  
**Ação esperada:** conferir uma evolução concluída.  
**CTA principal:** `Conferir meus registros`

## Assuntos sugeridos

1. A IA organiza. Você continua no controle.
2. Confira o conteúdo antes de utilizá-lo
3. Seu conhecimento permanece no centro

## Preheader

O texto organizado precisa representar corretamente o atendimento.

## Conteúdo-base

A inteligência artificial pode apoiar a transcrição e a organização da redação.

Ela não substitui sua análise, seu conhecimento nem sua responsabilidade profissional.

Ao utilizar um registro, confira:

- se o conteúdo representa corretamente o atendimento;
- se os termos estão adequados;
- se existem informações que precisam ser ajustadas;
- se o texto está coerente com sua prática;
- se algo deve ser acrescentado ou removido.

A plataforma apoia a organização. O conteúdo final continua sob seu controle.

**CTA:** Conferir meus registros

## Observação de métrica

O clique ou a conclusão da evolução não devem ser tratados automaticamente como confirmação de revisão.

---

# 15. Mensagem 7 — Consulte o histórico do paciente

**Categoria:** educação  
**Objetivo:** mostrar o valor da continuidade.  
**Ação esperada:** acessar o paciente ou prontuário.  
**CTA principal:** `Consultar histórico`

## Assuntos sugeridos

1. O histórico ajuda no próximo atendimento
2. Consulte os registros do paciente
3. Mais continuidade, menos procura

## Preheader

Relembre informações importantes antes do próximo atendimento.

## Conteúdo-base

Quando os registros ficam reunidos no prontuário, consultar informações anteriores se torna mais simples.

O histórico pode ajudar você a:

- relembrar pontos do encontro anterior;
- acompanhar mudanças ao longo do tempo;
- consultar orientações registradas;
- manter continuidade entre atendimentos;
- localizar informações sem procurar em diferentes arquivos.

**Desafio de hoje:** abra um paciente e consulte os registros disponíveis.

**CTA:** Consultar histórico

---

# 16. Mensagem 8 — Registre entre atendimentos

**Categoria:** formação de hábito  
**Objetivo:** inserir a plataforma em um momento real da rotina.  
**Ação esperada:** criar uma evolução após um atendimento.  
**CTA principal:** `Registrar atendimento`

## Assuntos sugeridos

1. Aproveite os minutos entre atendimentos
2. Registre enquanto as informações estão recentes
3. Um resumo antes do próximo paciente

## Preheader

Use um pequeno intervalo para registrar os principais pontos.

## Conteúdo-base

Atendimentos consecutivos podem tornar difícil parar para escrever uma evolução completa.

Uma alternativa é utilizar os minutos seguintes ao atendimento para gravar um resumo enquanto as informações ainda estão recentes.

Depois do processamento, confira o conteúdo e continue sua rotina.

O objetivo não é transformar cada intervalo em uma tarefa longa, mas reduzir o acúmulo e preservar os pontos importantes.

**CTA:** Registrar atendimento

---

# 17. Mensagem 9 — Retome registros acumulados

**Categoria:** percepção de valor  
**Objetivo:** trabalhar o acúmulo sem gerar culpa.  
**Ação esperada:** concluir uma evolução pendente ou criar uma nova.  
**CTA principal:** `Retomar meus registros`

## Assuntos sugeridos

1. A semana ficou corrida?
2. Quando os registros começam a acumular
3. Retome um atendimento de cada vez

## Preheader

Comece por um único registro e avance aos poucos.

## Conteúdo-base

Em semanas cheias, algumas tarefas administrativas podem ficar para depois.

Quanto mais tempo passa, mais difícil pode ser recuperar detalhes e reorganizar os registros.

Você não precisa resolver tudo de uma vez.

Escolha um atendimento, grave um resumo com os principais pontos e conclua uma evolução.

Uma ação pequena pode ser o começo da retomada.

**CTA:** Retomar meus registros

---

# 18. Mensagem 10 — Fechamento da rotina

**Categoria:** formação de hábito  
**Objetivo:** sugerir um ritual simples no fim do dia.  
**Ação esperada:** conferir pacientes e registros.  
**CTA principal:** `Revisar minha rotina`

## Assuntos sugeridos

1. Um fechamento simples para o fim do dia
2. Antes de encerrar os atendimentos
3. Termine o dia com mais organização

## Preheader

Confira rapidamente o que foi registrado e o que precisa ser retomado.

## Conteúdo-base

Uma rotina de fechamento pode ajudar a reduzir o acúmulo de registros.

Antes de encerrar o dia, experimente:

1. conferir os pacientes atendidos;
2. verificar quais evoluções foram concluídas;
3. identificar registros que precisam ser retomados;
4. organizar a próxima ação do dia seguinte.

O Evolução Clínica pode apoiar esse processo reunindo pacientes, prontuários e registros no mesmo fluxo.

**CTA:** Revisar minha rotina

---

# 19. Mensagem 11 — Documentos e relatórios

**Categoria:** descoberta de funcionalidade  
**Objetivo:** ampliar o valor percebido.  
**Ação esperada:** conhecer uma área disponível na conta.  
**CTA principal:** `Conhecer documentos`

## Assuntos sugeridos

1. Seus registros podem apoiar outros documentos
2. Conheça a área de documentos
3. Há mais recursos para organizar o acompanhamento

## Preheader

Explore os recursos de documentos disponíveis na sua conta.

## Conteúdo-base

Além das evoluções, o Evolução Clínica possui recursos que podem apoiar a organização de documentos e relatórios.

A disponibilidade depende do plano e da configuração da conta.

Ao utilizar qualquer documento produzido com apoio da plataforma, confira o conteúdo e faça as adequações necessárias antes do uso.

**CTA:** Conhecer documentos

## Regra

Não mencionar um tipo específico de documento que não esteja disponível para o usuário.

---

# 20. Mensagem 12 — O que a IA faz na plataforma

**Categoria:** quebra de objeção  
**Objetivo:** alinhar expectativas.  
**Ação esperada:** utilizar novamente o recurso.  
**CTA principal:** `Criar nova evolução`

## Assuntos sugeridos

1. O que a inteligência artificial faz na plataforma
2. A IA não substitui sua análise
3. Você continua no controle

## Preheader

Entenda o papel da IA na organização dos registros.

## Conteúdo-base

No Evolução Clínica, a inteligência artificial é utilizada como apoio à transcrição, à organização e à redação das informações fornecidas pelo usuário.

Ela não:

- realiza diagnóstico;
- define condutas;
- substitui o raciocínio clínico;
- elimina a necessidade de conferência;
- assume responsabilidade pelo registro.

A proposta é reduzir tarefas repetitivas de redação e organização, mantendo sua experiência profissional no centro do processo.

**CTA:** Criar nova evolução

---

# 21. Mensagem 13 — Recurso adicional relevante

**Categoria:** descoberta  
**Objetivo:** apresentar uma funcionalidade ainda não utilizada.  
**Ação esperada:** explorar um recurso disponível.  
**CTA principal:** dinâmico.

## Assuntos sugeridos

1. Um recurso que você talvez ainda não tenha usado
2. Explore outra possibilidade da plataforma
3. Conheça um recurso para complementar sua rotina

## Seleção do conteúdo

Apresentar apenas um recurso por e-mail.

Possíveis recursos confirmados ou já previstos na plataforma:

- migração assistida de prontuários;
- logotipo personalizado em relatórios;
- backup e restauração pelo Google Drive;
- assinatura digital;
- documentos e relatórios;
- lembretes de evolução;
- integração com Google Agenda;
- templates de evolução.

## Regra

O recurso deve:

- existir;
- estar disponível no plano;
- ainda não ter sido utilizado;
- ser relevante para o estágio do usuário.

## Cuidados

Não afirmar:

- proteção legal garantida;
- conformidade automática;
- segurança absoluta;
- disponibilidade em todos os planos.

---

# 22. Mensagem 14 — Seu progresso e a próxima ação

**Categoria:** retenção  
**Objetivo:** reconhecer o avanço e recomendar uma ação.  
**Ação esperada:** executar a próxima melhor ação.  
**CTA principal:** dinâmico.

## Assuntos sugeridos

1. Veja o que você já começou a organizar
2. Seu progresso no Evolução Clínica
3. Continue de onde parou

## Conteúdo dinâmico

Olá, {{primeiro_nome}}!

Desde que sua conta foi ativada, você já:

- cadastrou {{quantidade_pacientes}} paciente(s);
- vinculou {{quantidade_prontuarios}} prontuário(s);
- concluiu {{quantidade_evolucoes}} evolução(ões);
- utilizou {{quantidade_recursos}} recurso(s) adicional(is).

## Próxima ação

Selecionar conforme o estado:

- sem paciente: cadastrar primeiro paciente;
- paciente sem prontuário: configurar prontuário;
- prontuário sem evolução: criar primeira evolução;
- primeira evolução concluída: consultar histórico;
- usuário recorrente: conhecer recurso avançado;
- teste encerrado: conhecer opções de continuidade;
- assinante: explorar recurso disponível no plano.

## Fallback

Se não houver dados suficientes, utilizar:

> Você já começou a conhecer a plataforma. Continue pela próxima etapa recomendada na sua conta.

---

# 23. Mensagem 15 — A jornada continua na rotina

**Categoria:** retenção e continuidade  
**Objetivo:** concluir a sequência sem parecer uma despedida.  
**Ação esperada:** continuar usando, assinar ou explorar.  
**CTA principal:** variável.

## Assuntos sugeridos

1. A jornada termina. Sua organização continua.
2. Seu próximo passo no Evolução Clínica
3. Continue organizando seus registros

## Preheader

As mensagens da jornada terminam, mas o uso continua na sua rotina.

## Conteúdo-base

Olá, {{primeiro_nome}}!

Chegamos à última mensagem desta jornada de apresentação.

Você conheceu os principais passos para:

- cadastrar pacientes;
- criar ou vincular prontuários;
- gravar evoluções;
- acompanhar registros;
- consultar históricos;
- explorar recursos complementares.

A melhor forma de perceber o valor da plataforma é utilizá-la nos momentos reais da sua rotina.

Sempre que concluir um atendimento, tiver registros pendentes ou precisar consultar um histórico, você poderá continuar de onde parou.

A inteligência artificial apoia a organização e a redação. Você continua no controle do conteúdo.

## CTA por status

- sem paciente: `Cadastrar primeiro paciente`;
- paciente sem prontuário: `Configurar prontuário`;
- prontuário sem evolução: `Criar primeira evolução`;
- usuário ativado em teste: `Continuar usando`;
- teste encerrado: `Conhecer os planos`;
- assinante: `Explorar mais recursos`;
- usuário inativo: `Retomar minha conta`.

---

# PARTE III — FLUXO COMERCIAL DO TESTE DE 7 DIAS

# 24. Princípio

As mensagens comerciais não pertencem a dias fixos da jornada.

Elas devem ser calculadas com base em:

```text
trial_ends_at
```

Possuem prioridade superior à sequência educativa.

---

# 25. Três dias antes do fim do teste

**Objetivo:** preparar a decisão.  
**CTA:** `Conhecer os planos`

## Assunto sugerido

Seu período de teste termina em 3 dias

## Conteúdo-base

Olá, {{primeiro_nome}}!

Seu período de teste termina em {{data_fim_teste}}.

Até agora, você já:

- cadastrou {{quantidade_pacientes}} paciente(s);
- vinculou {{quantidade_prontuarios}} prontuário(s);
- concluiu {{quantidade_evolucoes}} evolução(ões).

Conheça as opções disponíveis para continuar utilizando a plataforma depois do teste.

**CTA:** Conhecer os planos

## Adaptação para usuário não ativado

Se o usuário ainda não concluiu uma evolução:

> Você ainda tem alguns dias para experimentar o fluxo completo. Comece pela próxima ação recomendada e, caso encontre dificuldade, utilize o suporte.

CTA prioritário:

`Concluir minha primeira evolução`

Link secundário:

`Conhecer os planos`

---

# 26. Um dia antes do fim do teste

**Objetivo:** lembrar sem pressão excessiva.  
**CTA:** `Continuar com o Evolução Clínica`

## Assunto sugerido

Seu teste termina amanhã

## Conteúdo-base

Seu período de teste termina amanhã.

Caso o Evolução Clínica esteja apoiando sua organização, conheça os planos disponíveis para continuar utilizando seus recursos.

Se você ainda não conseguiu experimentar o fluxo completo, acesse a plataforma ou entre em contato com o suporte.

**CTA:** Continuar com o Evolução Clínica

---

# 27. Teste encerrado

**Objetivo:** informar a mudança de acesso e orientar a continuidade.  
**CTA:** `Escolher um plano`

## Assunto sugerido

Seu período de teste terminou

## Conteúdo-base

Seu período de teste do Evolução Clínica terminou.

Para continuar utilizando os recursos disponíveis, escolha um dos planos apresentados na plataforma.

Caso você já tenha realizado a assinatura, acesse novamente para atualizar o status da sua conta.

**CTA:** Escolher um plano

## Regra

Informar somente comportamentos reais sobre:

- bloqueio;
- armazenamento;
- manutenção dos dados;
- recuperação de acesso.

Não inventar o que acontece com os dados após a expiração.

---

# 28. Dois dias após o encerramento

**Objetivo:** recuperar usuários que não assinaram.  
**CTA:** `Retomar minha conta`

## Assunto sugerido

Continue de onde você parou

## Conteúdo-base

Você já começou a organizar sua rotina no Evolução Clínica.

Se desejar continuar utilizando pacientes, prontuários e evoluções, escolha um plano e retome sua conta.

Caso tenha encontrado alguma dificuldade durante o teste, entre em contato com o suporte.

**CTA:** Retomar minha conta

---

# 29. Sete dias após o encerramento

**Objetivo:** última recuperação do ciclo inicial.  
**CTA:** `Voltar ao Evolução Clínica`

## Assunto sugerido

O que impediu você de continuar?

## Conteúdo-base

Gostaríamos de entender se algo dificultou sua continuidade no Evolução Clínica.

Pode ter sido:

- falta de tempo para testar;
- dificuldade para conectar o Google;
- dúvida ao criar a primeira evolução;
- preço;
- ausência de algum recurso;
- outra necessidade.

Sua resposta pode ajudar a melhorar a plataforma.

**CTA:** Voltar ao Evolução Clínica

Link secundário:

`Contar o que aconteceu`

---

# PARTE IV — E-MAILS CONDICIONAIS

# 30. Regras gerais

Um e-mail condicional pode:

- substituir o e-mail educativo do dia;
- adiar o passo da jornada;
- impedir o envio de conteúdo obsoleto;
- recomendar a próxima melhor ação.

Ele não deve fazer o usuário receber duas mensagens de relacionamento no mesmo período de 24 horas.

---

# 31. Conta ativa, sem novo acesso

**Gatilho:** conta liberada e nenhum novo login após 24 horas.  
**Prioridade:** alta.  
**CTA:** `Acessar minha conta`

## Assunto

Sua conta está pronta para continuar

## Conteúdo-base

Sua conta no Evolução Clínica já está disponível.

Acesse a plataforma e continue pela primeira etapa do onboarding.

Você não precisa configurar tudo agora. Comece por uma ação simples.

**CTA:** Acessar minha conta

---

# 32. Acessou, mas não cadastrou paciente

**Gatilho:** login realizado e zero pacientes após 24 horas.  
**Prioridade:** alta.  
**CTA:** `Cadastrar primeiro paciente`

## Assunto

Falta apenas o primeiro paciente para começar

## Conteúdo-base

Você já acessou o Evolução Clínica.

O próximo passo é cadastrar um paciente para iniciar a organização dos prontuários e evoluções.

Comece com apenas um cadastro para conhecer o processo.

**CTA:** Cadastrar primeiro paciente

---

# 33. Paciente cadastrado, mas sem prontuário vinculado

**Gatilho:** possui paciente e nenhum `google_doc_id`.  
**Prioridade:** muito alta.  
**CTA:** `Configurar prontuário`

## Assunto

Seu paciente já está cadastrado. Falta o prontuário.

## Conteúdo-base

O paciente já foi cadastrado.

Antes de criar a primeira evolução, crie ou vincule o prontuário desse paciente no Google Docs.

Essa etapa prepara o fluxo para que as evoluções concluídas sejam organizadas no documento.

**CTA:** Configurar prontuário

---

# 34. Prontuário vinculado, mas sem evolução

**Gatilho:** possui prontuário vinculado e zero evoluções concluídas após 24 horas.  
**Prioridade:** muito alta.  
**CTA:** `Criar primeira evolução`

## Assunto

Seu prontuário está pronto para a primeira evolução

## Conteúdo-base

O prontuário já está vinculado.

Agora, grave ou envie um resumo em áudio para experimentar o fluxo completo.

Depois do processamento, confira o conteúdo e utilize o registro no acompanhamento.

**CTA:** Criar primeira evolução

---

# 35. Evolução em processamento por tempo excessivo

**Gatilho:** evolução persistida com processamento pendente além do limite esperado.  
**Prioridade:** máxima.  
**CTA:** `Verificar evolução`

## Assunto

Sua evolução ainda está em processamento

## Conteúdo-base

Uma evolução iniciada ainda não foi concluída.

Acesse a plataforma para verificar o status.

Se o processamento apresentar erro, utilize a opção disponível para tentar novamente ou procure o suporte.

**CTA:** Verificar evolução

## Regra

Não enviar se houver uma falha geral conhecida do sistema.

---

# 36. Evolução com erro

**Gatilho:** transcrição ou inclusão no prontuário com status de falha.  
**Prioridade:** máxima.  
**CTA:** `Tentar novamente`

## Assunto

Não foi possível concluir sua evolução

## Conteúdo-base

A plataforma encontrou uma dificuldade ao processar sua evolução.

Acesse o registro para tentar novamente.

Caso o problema continue, envie uma solicitação ao suporte com as informações do erro exibido na plataforma.

**CTA:** Tentar novamente

---

# 37. Gravação local não finalizada

**Status:** dependente de nova telemetria frontend.  
**Ativar somente após implementação técnica.**

O sistema atual pode guardar gravações localmente.

Para enviar este e-mail, será necessário:

- registrar o início da gravação;
- registrar a recuperação ou exclusão;
- confirmar que ela permaneceu não finalizada;
- impedir que o e-mail exponha informações do paciente.

## Mensagem possível

**Assunto:** Você possui uma gravação não finalizada

> Existe uma gravação iniciada que ainda não foi concluída. Abra a plataforma no mesmo dispositivo para verificar se ela está disponível para recuperação.

---

# 38. Primeira evolução concluída

**Gatilho:** primeira evolução concluída.  
**Prioridade:** alta.  
**CTA:** `Ver histórico`

## Assunto

Sua primeira evolução foi concluída

## Conteúdo-base

Parabéns, {{primeiro_nome}}!

Sua primeira evolução foi processada e adicionada ao prontuário.

Agora, consulte o paciente para ver como as informações ficam organizadas e continue utilizando a plataforma nos próximos atendimentos.

**CTA:** Ver histórico

## Regra contra duplicidade

A notificação operacional de sucesso não deve enviar outro e-mail com o mesmo conteúdo no mesmo momento.

---

# 39. Três evoluções concluídas

**Gatilho:** terceira evolução concluída.  
**Prioridade:** média.  
**CTA:** `Continuar organizando`

## Assunto

Você já concluiu três evoluções

## Conteúdo-base

Seus registros já estão começando a formar um histórico.

Continue utilizando a plataforma para facilitar a consulta e a continuidade entre atendimentos.

**CTA:** Continuar organizando

---

# 40. Cinco ou dez evoluções

**Gatilho:** atingir 5 ou 10 evoluções.  
**Prioridade:** média.  
**Objetivo:** reconhecer recorrência e apresentar recurso avançado.

## Conteúdo

- reconhecer o marco;
- apresentar um recurso ainda não utilizado;
- adaptar ao plano;
- não repetir o mesmo recurso.

---

# 41. Onboarding não concluído

**Gatilho:** `onboarding_completed = false` após período definido.  
**Prioridade:** alta.  
**CTA:** `Continuar onboarding`

## Assunto

Continue sua configuração inicial

## Regra de conteúdo

A mensagem deve apontar a próxima ação mensurável:

- cadastrar paciente;
- vincular prontuário;
- criar evolução;
- finalizar integração opcional.

Não depender apenas do estado salvo no navegador.

---

# 42. Três dias sem acesso

**Gatilho:** último login há três dias.  
**Prioridade:** média.  
**CTA:** `Continuar de onde parei`

## Assunto

Continue de onde você parou

## Conteúdo-base

Seus dados continuam disponíveis para você retomar a organização.

Acesse a conta e continue pela próxima ação recomendada.

**CTA:** Continuar de onde parei

---

# 43. Sete dias sem acesso

**Gatilho:** sete dias sem login.  
**Prioridade:** alta.  
**CTA:** `Retomar meus registros`

## Assunto

A semana ficou corrida?

## Conteúdo-base

Se os atendimentos ocuparam sua rotina e os registros ficaram para depois, comece por apenas uma ação.

Abra a plataforma, escolha um paciente e retome de onde parou.

**CTA:** Retomar meus registros

---

# 44. Quatorze dias sem acesso

**Gatilho:** 14 dias sem login.  
**Prioridade:** alta.  
**CTA:** `Preciso de ajuda`

## Assunto

Algo dificultou o uso da plataforma?

## Conteúdo-base

Percebemos que você não acessa o Evolução Clínica há alguns dias.

Gostaríamos de saber se você:

- encontrou dificuldade no Google;
- não conseguiu criar a primeira evolução;
- teve pouco tempo para testar;
- sentiu falta de alguma funcionalidade;
- encontrou outro impedimento.

**CTA:** Preciso de ajuda

---

# 45. Assinatura concluída

**Gatilho:** assinatura fica ativa.  
**Prioridade:** máxima.  
**CTA:** `Acessar minha conta`

## Assunto

Sua assinatura do Evolução Clínica está ativa

## Conteúdo-base

Olá, {{primeiro_nome}}!

Sua assinatura foi confirmada.

Você pode continuar utilizando os recursos disponíveis no seu plano para organizar pacientes, prontuários, evoluções e documentos.

As próximas mensagens serão direcionadas para ajudar você a aproveitar melhor sua conta.

**CTA:** Acessar minha conta

## Ações obrigatórias

Cancelar mensagens pendentes de:

- fim de teste;
- teste encerrado;
- recuperação comercial;
- contratação.

Manter conteúdos educativos adequados ao plano.

---

# 46. Assinante com baixo uso

**Gatilho:** plano ativo e baixo uso após sete dias.  
**Prioridade:** alta.  
**CTA:** dinâmico.

## Assunto

Vamos aproveitar melhor sua assinatura?

## Conteúdo-base

Sua assinatura está ativa, mas você utilizou poucos recursos nos últimos dias.

Escolha uma ação simples:

- cadastrar um paciente;
- vincular um prontuário;
- criar uma evolução;
- conhecer um recurso do seu plano.

**CTA:** próxima melhor ação.

---

# 47. Assinante recorrente

**Gatilho:** uso frequente.  
**Prioridade:** baixa ou média.  
**Objetivo:** retenção.

Conteúdos possíveis:

- templates de evolução;
- lembretes;
- documentos;
- relatórios;
- backup;
- logotipo;
- migração;
- integração com agenda;
- organização avançada.

---

# 48. Cancelamento solicitado

**Gatilho:** pedido de cancelamento.  
**Prioridade:** máxima.  
**CTA:** `Contar o que aconteceu`

## Assunto

Podemos entender sua decisão?

## Conteúdo-base

Recebemos sua solicitação de cancelamento.

Sua resposta pode ajudar a melhorar a plataforma.

Qual foi o principal motivo?

- dificuldade de uso;
- problema com integração;
- falta de tempo para testar;
- preço;
- ausência de recurso;
- problema técnico;
- a plataforma não se adaptou à rotina;
- outro motivo.

**CTA:** Contar o que aconteceu

## Regra

Não oferecer desconto automaticamente antes de conhecer o motivo.

---

# 49. Primeiro uso de recurso adicional

**Gatilho:** primeira utilização de um recurso relevante.  
**Prioridade:** baixa ou média.

A mensagem deve:

1. confirmar a ação;
2. explicar o próximo passo;
3. levar ao recurso relacionado;
4. não expor dados sensíveis.

Exemplos:

- primeiro relatório;
- primeira migração;
- primeiro backup;
- primeiro logotipo;
- primeira assinatura digital;
- primeiro lembrete configurado.

---

# 50. Regra desativada — Nunca utilizou áudio

Na versão anterior, havia um condicional para usuários que criavam evoluções somente por digitação.

Como o fluxo principal atual utiliza áudio, essa regra deve permanecer desativada.

Ela só poderá ser ativada se forem identificados usuários com:

- evoluções manuais;
- evoluções importadas;
- fluxo alternativo de criação;
- uso recorrente sem áudio.

---

# PARTE V — SEGMENTAÇÃO

# 51. Segmentação por profissão

A estrutura principal pode ser compartilhada, mas exemplos devem variar.

---

## 51.1. Terapeutas ocupacionais

Exemplos:

- objetivos terapêuticos;
- atividades realizadas;
- respostas observadas;
- desempenho ocupacional;
- orientações e continuidade.

---

## 51.2. Psicólogos e profissionais relacionados

Exemplos:

- temas trabalhados;
- observações relevantes;
- acompanhamento das sessões;
- continuidade do processo;
- orientações e encaminhamentos.

Não sugerir interpretação automática do conteúdo clínico.

---

## 51.3. Fisioterapeutas

Exemplos:

- condição funcional;
- procedimentos;
- exercícios;
- resposta ao atendimento;
- evolução entre sessões.

---

## 51.4. Fonoaudiólogos

Exemplos:

- habilidades trabalhadas;
- estratégias utilizadas;
- desempenho observado;
- resposta durante a sessão;
- orientações.

---

## 51.5. Psicopedagogos

Exemplos:

- habilidades observadas;
- atividades;
- estratégias aplicadas;
- resposta às propostas;
- continuidade.

---

## 51.6. Nutricionistas

Exemplos devem ser ajustados à rotina real e às funcionalidades confirmadas, sem sugerir diagnóstico ou conduta automática.

---

## 51.7. Enfermeiros, médicos e demais profissionais

Não generalizar regras éticas ou técnicas entre profissões.

Quando não houver uma adaptação validada, utilizar linguagem genérica:

- atendimento;
- registro;
- acompanhamento;
- histórico;
- orientação;
- próximos passos.

---

# 52. Segmentação por tipo de conta

## 52.1. Estado atual

A segmentação entre conta individual e clínica depende de um campo próprio.

## 52.2. Regra

Enquanto o campo não existir:

- usar mensagens para profissionais individuais;
- não afirmar recursos de equipe;
- não inferir clínica pela quantidade de pacientes;
- não ativar campanhas específicas de clínica.

## 52.3. Campo recomendado

```text
account_type:
  individual
  clinic
  team_member
```

---

# 53. Segmentação por plano e status

Estados principais:

## Em teste

- `subscription_plan = trial`;
- `subscription_status = trialing`.

## Assinante

- plano mensal ou anual;
- `subscription_status = active`.

## Teste encerrado ou assinatura cancelada

- `subscription_status = canceled`.

## Inadimplência ou falha

- `past_due`;
- `unpaid`.

Não utilizar a expressão “usuário gratuito permanente” se esse plano não existir.

---

# PARTE VI — REGRAS DE AUTOMAÇÃO

# 54. Limite de frequência

- no máximo um e-mail de relacionamento a cada 24 horas;
- e-mails transacionais podem ser enviados independentemente;
- confirmação de pagamento não deve ser bloqueada;
- recuperação de senha não entra no limite;
- evitar dois e-mails sobre a mesma ação;
- respeitar preferências e descadastro.

---

# 55. Ordem de prioridade

1. confirmação de assinatura ou pagamento;
2. erro técnico ou processamento interrompido;
3. fim do teste;
4. próxima ação essencial de ativação;
5. recuperação de abandono;
6. reativação;
7. mensagem da jornada principal;
8. recurso avançado;
9. conteúdo promocional.

---

# 56. Política de canais

A plataforma já possui notificações que podem combinar:

- in-app;
- push;
- e-mail.

Para evitar duplicidade:

## Confirmações comuns

Exemplos:

- paciente cadastrado;
- dados atualizados;
- evolução concluída.

Preferência:

```text
in-app = sim
push = sim
e-mail = não
```

O e-mail educativo ou comemorativo será controlado pela jornada.

## Eventos importantes

Exemplos:

- assinatura confirmada;
- fim do teste;
- falha que exige ação;
- alteração crítica de conta.

Podem utilizar e-mail.

---

# 57. Substituição do envio planejado

Quando um condicional de prioridade superior estiver elegível:

- enviar o condicional;
- adiar a mensagem da jornada;
- não perder a posição;
- recalcular a próxima data.

---

# 58. Skip definitivo

Ignorar a mensagem quando:

- a ação já foi concluída;
- o conteúdo se tornou obsoleto;
- o usuário assinou e a mensagem era comercial;
- o recurso não existe no plano;
- o usuário cancelou;
- o prazo máximo da jornada terminou;
- o usuário solicitou descadastro.

Registrar o motivo.

---

# 59. Pausa

Pausar quando:

- conta estiver pendente;
- conta estiver inativa;
- houver erro permanente no e-mail;
- usuário solicitar;
- campanha for pausada;
- houver reclamação de spam;
- estiver em fluxo de cancelamento que exija comunicação específica.

---

# 60. Saída

O usuário sai quando:

- concluir as 15 mensagens;
- exceder o prazo máximo;
- excluir a conta;
- solicitar descadastro;
- campanha for encerrada;
- matrícula for cancelada.

A assinatura não encerra automaticamente a jornada educativa.

---

# 61. Intervalos recomendados

| Situação | Intervalo |
|---|---:|
| Conta ativa sem retorno | 24 horas |
| Segundo lembrete sem retorno | 72 horas |
| Login sem paciente | 24 horas |
| Paciente sem prontuário | 24 horas |
| Prontuário sem evolução | 24 horas |
| Evolução em processamento | conforme limite técnico |
| Inatividade leve | 3 dias |
| Inatividade média | 7 dias |
| Inatividade alta | 14 dias |
| Aviso de teste | 3 dias antes |
| Segundo aviso | 1 dia antes |
| Teste encerrado | no encerramento |
| Recuperação | 2 dias depois |
| Última recuperação inicial | 7 dias depois |
| Assinante com baixo uso | 7 dias |

Os intervalos devem ser ajustados após análise de dados reais.

---

# PARTE VII — DADOS NECESSÁRIOS

# 62. Dados existentes ou derivados

- `user_id`;
- `email`;
- `full_name`;
- `professional_title`;
- `status`;
- `role`;
- `subscription_plan`;
- `subscription_status`;
- `subscription_ends_at`;
- `trial_ends_at`;
- `onboarding_completed`;
- quantidade de pacientes;
- quantidade de prontuários vinculados;
- quantidade de evoluções;
- quantidade de evoluções com áudio;
- quantidade de documentos;
- último acesso;
- última atividade;
- recursos utilizados;
- último e-mail enviado.

---

# 63. Dados que precisam ser adicionados

- matrícula na jornada;
- posição atual;
- próxima mensagem;
- prazo de conclusão;
- preferência de comunicação;
- descadastro;
- estado de ativação;
- histórico de condicionais;
- motivo de skip;
- prioridade;
- tentativas;
- conta individual ou clínica, se desejado;
- telemetria de gravação local, se desejada.

---

# 64. Eventos recomendados

```text
user_registered
user_activated
user_logged_in
profession_selected

onboarding_started
onboarding_completed

patient_created
patient_record_linked

evolution_started
evolution_completed
evolution_failed
audio_evolution_completed

patient_history_viewed

report_generated
migration_requested
migration_completed
backup_configured
custom_logo_added
digital_signature_used

trial_started
trial_expiring
trial_expired

subscription_started
subscription_renewed
subscription_status_changed
subscription_cancel_requested
subscription_cancelled

email_unsubscribed
account_deleted
```

## Regra de privacidade

Os eventos não devem armazenar:

- transcrição;
- texto da evolução;
- nome do paciente;
- diagnóstico;
- observações clínicas;
- conteúdo de documentos.

---

# PARTE VIII — PADRÃO EDITORIAL

# 65. Estrutura de cada e-mail

1. assunto claro;
2. preheader;
3. saudação;
4. uma situação ou benefício;
5. explicação curta;
6. uma única ação principal;
7. botão;
8. suporte ou rodapé;
9. preferências e descadastro quando aplicável.

---

# 66. Extensão

- 120 a 250 palavras;
- tutoriais podem ser um pouco mais longos;
- evitar blocos extensos;
- boa leitura no celular;
- listas somente quando facilitarem.

---

# 67. Tom de voz

- profissional;
- moderno;
- humano;
- confiável;
- acolhedor;
- simples;
- didático;
- sem pressão;
- sem culpa;
- sem exageros.

---

# 68. CTAs recomendados

- Acessar minha conta
- Continuar configuração
- Cadastrar primeiro paciente
- Configurar prontuário
- Criar primeira evolução
- Gravar um resumo
- Conferir meus registros
- Consultar histórico
- Registrar atendimento
- Retomar meus registros
- Conhecer documentos
- Explorar recurso
- Conhecer os planos
- Continuar usando
- Retomar minha conta
- Preciso de ajuda

Evitar “Saiba mais” quando houver uma ação específica.

---

# 69. Personalização

## Variáveis

```text
{{primeiro_nome}}
{{nome_completo}}
{{profissao}}
{{quantidade_pacientes}}
{{quantidade_prontuarios}}
{{quantidade_evolucoes}}
{{quantidade_audios}}
{{quantidade_documentos}}
{{quantidade_recursos}}
{{plano_atual}}
{{data_fim_teste}}
{{dias_restantes_teste}}
{{proxima_acao}}
{{link_acao}}
{{link_suporte}}
```

## Fallback

Caso uma variável esteja vazia:

- ocultar a informação;
- utilizar uma frase genérica;
- nunca mostrar `null`, `undefined` ou valores incorretos.

---

# 70. Links diretos

O botão deve levar, sempre que possível, para:

- onboarding;
- novo paciente;
- edição do paciente;
- configuração do prontuário;
- nova evolução;
- histórico;
- documentos;
- assinatura;
- suporte;
- perfil.

Não direcionar todos os CTAs para o dashboard.

---

# PARTE IX — MÉTRICAS

# 71. Métricas de ativação

- retorno após a ativação;
- tempo até o primeiro login;
- tempo até o primeiro paciente;
- percentual com prontuário vinculado;
- tempo até a primeira evolução;
- percentual ativado em 24 horas;
- percentual ativado em 7 dias;
- usuários ativos em 7, 15 e 30 dias;
- número de evoluções por usuário.

---

# 72. Métricas de conversão

- teste para assinatura;
- conversão de usuários ativados;
- conversão de usuários não ativados;
- conversão por profissão;
- conversão por origem;
- tempo até assinatura;
- cancelamento;
- reativação.

---

# 73. Métricas de e-mail

- agendado;
- enviado;
- falhou;
- entregue, quando disponível;
- clique;
- descadastro;
- reclamação;
- ação realizada após o envio.

A abertura não deve ser utilizada como único indicador.

---

# 74. Métricas de retenção

- uso após 7 dias;
- uso após 15 dias;
- uso após 30 dias;
- frequência de login;
- frequência de evoluções;
- uso de recursos adicionais;
- assinantes com baixo uso;
- cancelamento por falta de ativação.

---

# 75. Testes A/B

## Assuntos

- benefício direto versus curiosidade;
- dor reconhecível versus instrução;
- com nome versus sem nome.

## CTA

- primeira pessoa versus infinitivo;
- ação direta versus benefício.

## Conteúdo

- texto curto versus médio;
- exemplo genérico versus adaptado por profissão;
- tutorial em passos versus explicação.

## Momento

- 24 horas após a ação;
- próximo horário fixo;
- manhã versus fim do dia.

---

# PARTE X — REGRAS DE CONFORMIDADE E SEGURANÇA

# 76. Dados clínicos nos e-mails

Não incluir:

- nome de paciente;
- diagnóstico;
- transcrição;
- conteúdo da evolução;
- conteúdo do prontuário;
- dados de documentos;
- informações sensíveis.

Utilizar frases genéricas:

> Você possui uma evolução que precisa ser verificada.

Não:

> A evolução do paciente X apresentou erro.

---

# 77. Descadastro

E-mails educativos e comerciais devem conter:

- identificação da plataforma;
- link de preferências;
- link de descadastro;
- contato de suporte.

E-mails estritamente transacionais devem seguir a política definida para a plataforma.

---

# 78. Recursos e planos

Antes de mencionar um recurso:

1. verificar se ele existe;
2. verificar se está disponível no plano;
3. verificar se o usuário já utilizou;
4. confirmar se o link está correto;
5. não prometer resultado jurídico, clínico ou técnico.

---

# PARTE XI — MAPA DA PRÓXIMA MELHOR AÇÃO

# 79. Decisão principal

## Conta ativa sem retorno

Acessar a plataforma.

## Acessou sem paciente

Cadastrar paciente.

## Paciente sem prontuário

Criar ou vincular Google Docs.

## Prontuário sem evolução

Criar primeira evolução.

## Evolução falhou

Tentar novamente ou procurar suporte.

## Primeira evolução concluída

Consultar histórico.

## Usuário ativado

Formar hábito.

## Usuário recorrente

Explorar recurso avançado.

## Teste próximo do fim

Conhecer planos.

## Assinante

Aproveitar o plano.

## Inativo

Retomar a conta.

## Cancelando

Informar o motivo e concluir o processo corretamente.

---

# PARTE XII — REQUISITOS ANTES DA ATIVAÇÃO

# 80. Validações necessárias

- URLs diretas;
- textos dos planos;
- comportamento após o teste;
- recursos por plano;
- canal oficial de suporte;
- política de descadastro;
- conteúdo do Dia 0 existente;
- integração com Brevo ou SMTP;
- política de canais das notificações;
- templates HTML;
- horários;
- fuso;
- mensagens de erro;
- dados disponíveis para métricas;
- campo de tipo de conta, se utilizado.

---

# 81. Ativação recomendada

## Fase 1 — Modo de simulação

- calcular mensagens;
- não enviar;
- verificar decisões.

## Fase 2 — Equipe interna

- usuários de teste;
- simular os 15 passos;
- validar links.

## Fase 3 — Coorte pequena

- novos usuários selecionados;
- acompanhar duplicidades;
- analisar falhas.

## Fase 4 — Novos usuários

- ativar para novos cadastros;
- não matricular automaticamente todos os usuários antigos.

---

# 82. Resultado esperado

Ao concluir a jornada, o usuário deve:

- entender a proposta do Evolução Clínica;
- ter retornado à plataforma;
- ter cadastrado um paciente;
- ter criado ou vinculado um prontuário;
- ter experimentado uma evolução por áudio;
- compreender que deve conferir o conteúdo;
- saber consultar o histórico;
- perceber aplicações na rotina;
- conhecer recursos relevantes;
- saber onde procurar suporte;
- compreender como continuar depois do teste.

O sucesso será medido principalmente pelas ações realizadas na plataforma, e não apenas pelas aberturas dos e-mails.
