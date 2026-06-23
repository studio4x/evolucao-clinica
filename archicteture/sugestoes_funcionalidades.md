# Sugestões de Funcionalidades e Evolução da Plataforma

Este documento reúne propostas de melhorias, novos recursos e evoluções estratégicas para a plataforma de **Evolução Clínica**, organizadas por facilidade de implementação, impacto no usuário final e valor comercial para o modelo SaaS.

---

## 🗺️ Visão Geral do Roadmap Sugerido

```mermaid
graph TD
    A[Templates de Evolução SOAP/ABA] --> B[Entrada Multimodal Scratchpad]
    B --> C[Assinatura Digital ICP/Gov.br]
    C --> D[Portal do Responsável/Paciente]
    D --> E[Copiloto de Laudos e Documentos]
    E --> F[Histórico Visual de Métricas/AI Insights]
```

---

## 🚀 Fase 1: Diferenciação Rápida e Redução de Atrito
*Foco: Funcionalidades de alta percepção de valor com esforço de desenvolvimento baixo/médio.*

### 1.1 Templates Personalizados de Evolução (Ex: SOAP, ABA, Psicanálise)
*   **Descrição:** Hoje o aplicativo usa um único padrão de IA para formatar a evolução. Esta funcionalidade permitirá que cada profissional escolha um template clínico antes de começar a ditar a sessão.
*   **Templates Comuns & Estruturas de Exemplo:**
    
    #### 📋 Exemplo 1: Estrutura SOAP (Padrão Ouro Clínico)
    Ideal para médicos, fisioterapeutas, fonoaudiólogos e terapeutas ocupacionais.
    *   **S - Subjetivo:** Relato do paciente ou responsável sobre sintomas, queixas, humor e estado geral.
        *   *Exemplo:* "Mãe relata que a criança esteve muito agitada e dormiu mal durante a semana."
    *   **O - Objetivo:** Dados mensuráveis coletados pelo terapeuta (sinais vitais, testes aplicados, exercícios concluídos, postura).
        *   *Exemplo:* "Paciente realizou treino de pinça fina com blocos de encaixe. Completou 3 ciclos de 5 minutos, necessitando de suporte verbal."
    *   **A - Avaliação:** Diagnóstico clínico do dia, análise do progresso e resposta ao tratamento.
        *   *Exemplo:* "Demonstra melhora gradual na coordenação motora fina, porém com tolerância à frustração reduzida em atividades de desafio."
    *   **P - Plano:** Próximos passos do tratamento, ajustes de dosagem/exercícios ou tarefas para casa.
        *   *Exemplo:* "Manter o treino de pinça na próxima sessão. Orientado aos pais repetir o estímulo com feijões em casa."

    #### 🧩 Exemplo 2: Estrutura ABA (Análise do Comportamento Aplicada)
    Muito utilizado para tratamento de autismo (TEA), psicopedagogia e desenvolvimento comportamental.
    *   **Antecedente (A):** O estímulo ou instrução que desencadeou o comportamento.
        *   *Exemplo:* "Solicitado ao paciente que organizasse os brinquedos na prateleira."
    *   **Comportamento (B):** A ação observável e mensurável do paciente.
        *   *Exemplo:* "Paciente gritou, jogou dois blocos no chão e se recusou a cumprir a tarefa por 3 minutos."
    *   **Consequência (C):** A resposta do ambiente ou do aplicador ao comportamento do paciente.
        *   *Exemplo:* "Terapeuta aplicou a técnica de redirecionamento com ajuda física parcial até o paciente recolher os blocos."
    *   **Nível de Suporte (Prompting):** Independente, Verbal, Gestual, Físico Parcial ou Físico Total.
        *   *Exemplo:* "Necessitou de ajuda física parcial (mão sobre mão) para iniciar."
    *   **Comportamento de Barreira:** Estereotipias, agressividade, fuga de demanda.

    #### 🗣️ Exemplo 3: Estrutura Narrativo / Psicanálise
    Focado em associação livre, conteúdos latentes, e análise de transferência e contratransferência.
    *   **Conteúdo Manifesto (Relato Livre):** Os temas abordados livremente pelo paciente durante a sessão.
        *   *Exemplo:* "Paciente trouxe questões sobre a relação com a figura paterna e medos de abandono profissional."
    *   **Análise Clínica / Conteúdo Latente:** A interpretação do analista sobre lapsos de linguagem, sonhos relatados e silêncios.
        *   *Exemplo:* "Identificada resistência ao aprofundar a dinâmica familiar, expressada por meio de risos nervosos e desvios de assunto."
    *   **Dinâmica Transferencial:** O vínculo estabelecido entre analista e analisando na sessão.
        *   *Exemplo:* "Percepção de projeção de autoridade paterna sobre a figura do terapeuta."

    #### ⚠️ 1.1.1 Como lidar se o áudio não possuir informações suficientes para o template?
    Quando o profissional ditar uma sessão curta ou esquecer de mencionar dados essenciais exigidos pelo modelo (ex: escolheu SOAP mas não falou o plano "P"), a plataforma adotará as seguintes estratégias automáticas configuradas no prompt do Gemini:
    
    1.  **Notas de Preenchimento Neutro (Soft Placeholders):**
        *   Em vez de inventar dados (alucinação) ou falhar, a IA deve preencher o campo ausente com uma marcação neutra e clara como `[Não relatado pelo profissional no áudio]` ou `[Não observado/mencionado]`.
    2.  **Fallback Automático para Relato Geral (Modo Narrativo):**
        *   Se o áudio contiver pouquíssima informação técnica (ex: menos de 20 segundos apenas com comentários vagos), o Gemini detecta a incompatibilidade estrutural e formata o texto como uma **"Anotação de Sessão Curta"** ou **"Anotação Geral"**, exibindo um aviso amigável na tela do app: *"Não identificamos dados suficientes para o padrão SOAP. Formatamos como texto corrido."*
    3.  **Interface de Edição Prvia (Formulário Editável):**
        *   Antes de enviar diretamente para o Google Docs, a evolução processada pela IA é exibida em uma tela de visualização no app. Os campos vazios ou marcados como `[Não relatado]` ficam destacados em cor amarela/âmbar, permitindo que o profissional simplesmente clique e digite o complemento em segundos.

*   **Estrutura Técnica sugerida:**
    *   Tabela `evolution_templates` (`id`, `professional_id` (opcional para templates globais), `name`, `system_prompt_instruction`).
    *   Alterar a tabela `patients` para incluir `default_template_id` (vinculando um template padrão por paciente).
    *   Dropdown na tela `NewEvolution.tsx` que vem pré-selecionado com o `default_template_id` do paciente, mas permite alteração dinâmica na hora de iniciar a evolução.
*   **Comportamento de UX (Recomendado):**
    *   **Configuração Inicial:** O terapeuta escolhe a abordagem metodológica preferida (ex: ABA para um paciente com TEA, SOAP para fisioterapia motora) diretamente no cadastro do paciente.
    *   **Fluxo Diário:** Ao clicar em "Nova Evolução", o sistema carrega o template correto instantaneamente de forma transparente, economizando cliques.
    *   **Flexibilidade:** Se o terapeuta fizer uma sessão diferenciada (ex: uma anamnese ou avaliação inicial), ele pode trocar o template naquele atendimento específico sem alterar o padrão do paciente.
*   **Valor:** Expande o mercado-alvo do app para qualquer especialidade de saúde.

### 1.2 Scratchpad de Apoio (Entrada Multimodal Texto + Áudio)
*   **Descrição:** Um bloco de notas rápido na tela de gravação onde o terapeuta pode digitar palavras-chave, nomes de medicamentos complexos, CIDs ou termos difíceis que a IA poderia ouvir errado.
*   **Funcionamento:** O texto do Scratchpad é enviado junto com o áudio no prompt do Gemini como "Contexto Adicional de Apoio".
*   **Valor:** Reduz em 90% a necessidade de edição manual pós-transcrição.

---

## 🔐 Fase 2: Segurança Regulatória e Profissionalização
*Foco: Tornar a plataforma 100% em conformidade com as regras dos Conselhos Federais de Saúde (CFP, CREFITO, CREFONO, etc.).*

### 2.1 Assinatura Digital e Fechamento de Evolução
*   **Descrição:** No Brasil, prontuários eletrônicos devem ter garantia de que não foram adulterados retroativamente.
*   **Funcionamento:**
    *   Após criar ou revisar a evolução, o profissional clica em **"Assinar e Fechar"**.
    *   O status da evolução muda para `signed` e ela torna-se **somente leitura**.
    *   Integração com assinatura eletrônica gratuita do **Gov.br** ou chave de assinatura do próprio app com carimbo de data, hora e IP do profissional.
*   **Valor:** Proteção jurídica completa para o profissional de saúde em caso de fiscalização dos conselhos ou processos.

### 2.2 Controle Financeiro de Sessões Simplificado
*   **Descrição:** Vincular o valor cobrado por sessão ao fluxo de evoluções dos pacientes.
*   **Recursos:**
    *   Campo "Valor da Sessão" no cadastro do paciente.
    *   Histórico de faturamento bruto baseado nas sessões gravadas/evoluídas.
    *   Relatório de sessões a cobrar (ex: "Pacientes com pacotes pendentes de pagamento").
*   **Valor:** Transforma o app em uma ferramenta de gestão diária essencial para o terapeuta autônomo.

---

## 📈 Fase 3: Geração de Relatórios e Inteligência Clínica
*Foco: Automatizar o trabalho administrativo mais pesado do terapeuta.*

### 3.1 Copiloto para Laudos, Atestados e Encaminhamentos (PDF)
*   **Descrição:** O terapeuta gasta cerca de 30 a 50 minutos para escrever relatórios estruturados para escolas, planos de saúde ou médicos parceiros (neuropediatras, psiquiatras).
*   **Funcionamento:**
    *   A IA analisa o histórico de evoluções anteriores de um período selecionado.
    *   Gera um rascunho completo de laudo de evolução clínica ou encaminhamento profissional.
    *   O sistema exporta para um PDF formatado com papel timbrado (logotipo e cores do profissional configurados nas preferências de marca).
*   **Valor:** Economia gigantesca de tempo administrativo para o profissional.

### 3.2 Painel Visual de Progresso (AI Insights)
*   **Descrição:** Gráficos que demonstram visualmente o avanço do paciente baseado na análise semântica das evoluções pela IA.
*   **Recursos:**
    *   Métricas como: *Nível de Engajamento*, *Adesão às Atividades para Casa*, *Estabilidade Emocional*, e *Evolução Motora*.
    *   Gráfico de linha mostrando a evolução desses sentimentos/notas ao longo das semanas.
*   **Valor:** Uma ferramenta visual incrível para o profissional mostrar aos pais ou médicos em reuniões de discussão de caso.

---

## 🤝 Fase 4: Integração Familiar e do Paciente
*Foco: Criar canais de comunicação seguros e práticos.*

### 4.1 Portal do Responsável (Link Seguro / Área do Paciente)
*   **Descrição:** Compartilhar tarefas para casa e feedbacks clínicos de forma profissional, segura e sem poluir o WhatsApp do terapeuta.
*   **Funcionamento:**
    *   O profissional gera um link público seguro (com senha ou token temporário).
    *   O responsável acessa uma página otimizada para celular contendo as orientações para casa geradas pela IA e o Plano de Desenvolvimento Individual (PDI) ativo.
*   **Valor:** Melhora absurda na percepção de valor do serviço prestado pelo terapeuta aos olhos da família.

---

## 🔮 Fase 5: Recursos Avançados e Inteligência Preditiva (Disruptivo)
*Foco: Funcionalidades inovadoras para escala e retenção de clientes.*

### 5.1 Busca Semântica em Prontuários (RAG Clínico)
*   **Descrição:** Conforme o prontuário do paciente cresce, encontrar uma informação específica (ex: dosagem de medicamento anterior, sintomas relatados há meses) torna-se difícil.
*   **Funcionamento:**
    *   A IA indexa semanticamente todas as evoluções do paciente.
    *   O terapeuta pode fazer perguntas em linguagem natural na página do paciente: *"Qual foi a última dosagem de Ritalina mencionada pelo médico?"* ou *"Quando o paciente começou a apresentar resistência ao contato visual?"*.
    *   O sistema responde instantaneamente com as datas e trechos exatos das evoluções correspondentes.
*   **Valor:** Resgate imediato de informações valiosas sem necessidade de releitura manual de dezenas de páginas.

### 5.2 Alertas de Absenteísmo e Evasão de Pacientes (Prevenção de Churn)
*   **Descrição:** Pacientes que faltam muito ou interrompem a terapia sem alta formal geram prejuízos e quebra no tratamento.
*   **Funcionamento:**
    *   O sistema analisa o fluxo de agendamentos no Google Calendar e a criação de evoluções.
    *   Dispara alertas automáticos: *"Alerta: O paciente João não comparece há 14 dias e não possui agendamento futuro. Deseja enviar uma mensagem de acompanhamento?"*.
*   **Valor:** Aumenta a retenção de pacientes e otimiza a ocupação de horários da clínica.

### 5.3 Copiloto para Faturamento de Convênios (Padrão TISS / Tabela TUSS)
*   **Descrição:** Profissionais que atendem planos de saúde gastam horas preenchendo guias TISS com códigos de procedimentos complexos (Tabela TUSS).
*   **Funcionamento:**
    *   Com base no texto da evolução, a IA identifica o tipo de intervenção (ex: psicoterapia individual, reabilitação neuropsicológica).
    *   Sugere os códigos TUSS corretos e pré-preenche um espelho da guia de faturamento para exportação ou cópia rápida.
*   **Valor:** Elimina a glosa de guias por erros de digitação e reduz o tempo de faturamento mensal.

### 5.4 Modo Copiloto de Sessão Completa (Gravação de Ambiente)
*   **Descrição:** Ao invés de o terapeuta gravar um áudio sintetizando o que aconteceu ao final do atendimento, ele grava toda a sessão de 50 minutos.
*   **Funcionamento:**
    *   O app grava a sessão inteira e utiliza um modelo de contexto longo para transcrever e extrair apenas os pontos cruciais: momentos de crise, conquistas de metas do PDI, combinados para a próxima sessão e reações do paciente.
*   **Valor:** Permite ao terapeuta focar 100% no paciente durante a sessão, sem precisar fazer anotações mentais ou de papel.

---

## 👥 Fase 6: Colaboração Multidisciplinar e Farmacologia (Visão de Ecossistema)
*Foco: Interação com outros profissionais e acompanhamento clínico médico.*

### 6.1 Compartilhamento Seguro Multidisciplinar (Equipe de Cuidados)
*   **Descrição:** Casos complexos de pacientes (como no autismo ou reabilitação) costumam ser atendidos por equipes multidisciplinares (Psicólogo, TO, Fonoaudiólogo, Psiquiatra).
*   **Funcionamento:**
    *   Permitir que terapeutas de diferentes clínicas que atendem o mesmo paciente compartilhem (com autorização expressa dos pais/paciente) metas específicas do PDI e resumos de evolução.
*   **Valor:** Integração real do tratamento, permitindo que o fonoaudiólogo saiba o que o psicólogo trabalhou naquela semana e vice-versa.

### 6.2 Separação de Vozes na Transcrição (Diariação de Oradores)
*   **Descrição:** Em sessões com gravação ambiental ou sessões de terapia familiar e de casal, o áudio contém a fala de mais de uma pessoa.
*   **Funcionamento:**
    *   A IA separa automaticamente quem está falando no texto final (ex: "Terapeuta:", "Paciente:", "Acompanhante:").
*   **Valor:** Transcrições mais fiéis à dinâmica real da sessão terapêutica de grupo ou familiar.

### 6.3 Monitoramento de Medicamentos e Efeitos Colaterais
*   **Descrição:** Terapeutas observam diariamente os efeitos práticos das medicações prescritas por psiquiatras ou neurologistas.
*   **Funcionamento:**
    *   O terapeuta cadastra a medicação atual do paciente.
    *   A IA monitora as evoluções clínicas em busca de menções a efeitos colaterais ou melhora de sintomas relacionados ao remédio (ex: irritabilidade, sono, foco).
    *   O app gera um relatório de eficácia farmacológica para o terapeuta entregar ao médico assistente do paciente.
*   **Valor:** Estreita a parceria científica entre o terapeuta e os médicos prescritores.


