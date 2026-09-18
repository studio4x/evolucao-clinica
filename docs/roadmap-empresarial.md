# Roadmap Empresarial — Clínicas, Licenças, Equipes e Pacientes Compartilhados

**Status:** Fase 0 consolidada — Fase 0.5 auditada — Fase 1A concluída — Fase 1B0 aprovada — Fase 1B1 revisada e endurecida em staging — Fase 1B2.1 revisada e endurecida em staging, aguardando revisão — etapas posteriores não iniciadas

**Tipo:** Especificação funcional, de dados, segurança e implantação  
**Escopo:** Plano empresarial para clínicas + colaboração profissional em pacientes  
**Documento de decisão:** Este arquivo deve ser tratado como referência antes de qualquer migration, tela, endpoint ou alteração de política RLS.

---

## 0. Decisões da Fase 0

Esta seção prevalece sobre propostas ou perguntas exploratórias das seções seguintes. Ela separa decisões já fechadas para a arquitetura de valores comerciais e jurídicos que ainda precisam de confirmação.

### 0.1 Decisões fechadas

| Tema | Definição para o primeiro ciclo |
|---|---|
| Plano | Nome comercial **Plano Clínica**, código interno preferencial `clinic` e cobrança `base_plus_seat`. `enterprise` fica reservado para uma eventual oferta futura de maior porte. |
| Catálogo mensal | `clinic_monthly`: base de **R$ 49,90/mês**, licença clínica de **R$ 29,90/mês** e mínimo de 3 licenças. Com 3 licenças: **R$ 139,60/mês**. |
| Catálogo anual | `clinic_yearly`: base de **R$ 499,00/ano**, licença clínica de **R$ 299,00/ano** e mínimo de 3 licenças. Com 3 licenças: **R$ 1.396,00/ano**. |
| Parametrização | Valores comerciais ficam em catálogo centralizado. IDs de produtos e preços do Stripe são variáveis por ambiente e nunca são fixados de forma insegura no frontend. |
| Nomenclatura | Na interface serão usados **Clínica**, **Equipe**, **Profissional** e **Licença**. No banco e no código, o limite de isolamento será chamado `organization`. |
| Autorização | Não será criado um papel global `empresarial`. Os papéis globais atuais permanecem compatíveis e as permissões da clínica serão derivadas de `organization_memberships`. |
| Papéis do MVP | Apenas `owner`, `manager` e `professional`. `clinical_supervisor` e `assistant` ficam fora do esquema inicial até existir especificação própria de acesso. |
| Proprietário | Cada clínica terá um único `owner` principal no MVP. A troca de proprietário será transacional, confirmada e auditada; o último owner nunca poderá ser simplesmente removido. |
| Mínimo de contratação | `minimum_contracted_seats = 3`, referente somente a licenças clínicas contratadas, não à quantidade total de membros. |
| Consumo de licença | Somente `clinical_access_enabled = true` consome licença. `owner` e `manager` exclusivamente administrativos não consomem; convite clínico pendente e válido reserva uma licença. |
| Ocupação | `available_seats = contracted_seats - active_seats - reserved_seats`. Nenhum contador será controlado diretamente pelo navegador. |
| Inadimplência | A falha de pagamento inicia `past_due`, com tolerância de 7 dias e continuidade assistencial. Após o prazo, a organização poderá entrar em `restricted`, sem exclusão automática de dados. |
| Cancelamento | Quando aplicável, usar `cancel_at_period_end = true`; o funcionamento permanece normal até o fim do período contratado. Cancelamento financeiro não equivale a arquivamento, restrição ou exclusão. |
| Retenção | `automatic_clinical_deletion = false` e `retention_policy = legal_review_pending`. Não existe prazo arbitrário de exclusão automática. |
| Múltiplas clínicas | A mesma conta poderá manter contexto pessoal e participar de uma ou mais clínicas. Toda ação terá um contexto ativo explícito; não haverá organização inferida silenciosamente no frontend. |
| Pacientes pessoais | Aceitar convite de clínica não transfere, vincula, duplica ou consolida pacientes, evoluções ou assinatura do contexto pessoal. |
| Paciente entre clínicas | Cada clínica terá seu próprio cadastro independente. Não haverá consolidação automática, busca global por CPF nem compartilhamento interclínicas no MVP. |
| Paciente dentro da clínica | O paciente existirá uma vez no diretório da clínica, terá um profissional primário obrigatório e poderá ter profissionais secundários. |
| Edição cadastral | `owner`, `manager` e profissional primário podem editar o cadastro compartilhado. Secundário e consultant apenas consultam por padrão. |
| Conteúdo clínico | Compartilhar o cadastro do paciente não compartilha evoluções, transcrições, relatórios, notas privadas ou documentos. Apenas o autor poderá ler o conteúdo clínico no MVP. |
| Gestão | `owner` e `manager` verão dados cadastrais necessários e metadados operacionais, nunca o texto clínico. Não haverá exceção de supervisão no MVP. |
| Imutabilidade | `organization_id`, `organization_patient_id`, autor, assinatura e histórico do artefato clínico são definidos na criação e não mudam com a troca de contexto, reatribuição ou desligamento. |
| Reatribuição | A clínica poderá reatribuir pacientes em férias, afastamentos e desligamentos. Autoria, assinatura e histórico anteriores permanecem imutáveis e não são transferidos ao novo profissional. |
| Cobrança do MVP | Stripe será o único fluxo automatizado. A assinatura terá item base e item por licença; a homologação usará Stripe Test Mode. Faturamento manual empresarial fica para uma fase posterior. |
| Compatibilidade | Usuários individuais continuam no fluxo atual. Recursos de clínicas serão aditivos e protegidos por feature flag por organização, desativada por padrão em produção. |

### 0.2 Pendências reais após a Fase 0

Nome, código, preços, periodicidade, mínimo de licenças e tolerância estão aprovados. Permanecem pendentes apenas validações jurídicas/regulatórias e configurações externas que não devem ser presumidas no repositório.

| Pendência | Estado atual | Onde bloqueia |
|---|---|---|
| Textos de privacidade, compartilhamento interno, retenção, consentimento e bases legais | `privacy_text_status = draft_pending_legal_review` | Uso de dados reais no piloto e lançamento público |
| Política regulatória de retenção e exclusão por categoria profissional | `retention_policy = legal_review_pending`; exclusão automática desabilitada | Exclusão autorizada e definição de prazos futuros |
| Operações exatas disponíveis em `restricted` | Devem preservar modelagem separada de leitura, escrita, exportação e retenção; definição final depende de validação operacional e jurídica | Implementação do estado restrito |
| IDs de produtos/preços e webhooks Stripe | Devem ser criados separadamente em Test Mode e Live Mode | Fase 2 e validação de cobrança |
| Acessos e variáveis dos ambientes de homologação | Vercel e Supabase de staging ainda não configurados nesta fase documental | Início seguro da Fase 1 |

### 0.3 Gates de início e liberação

- **Gate técnico:** nenhuma migration de clínicas será aplicada enquanto o ambiente de homologação não estiver isolado do Supabase de produção e o esquema real atual não tiver sido inventariado.
- **Gate de cobrança:** checkout e alteração de licenças só começam depois que produtos, preços e webhooks do Stripe Test Mode estiverem configurados por ambiente.
- **Gate clínico:** nenhum dado real será usado no piloto antes da aprovação jurídica dos textos de privacidade, compartilhamento, retenção, eventual consentimento e bases legais aplicáveis.
- **Gate de produção:** o merge poderá ocorrer com a feature flag desligada, mas sua ativação exige testes de isolamento entre duas clínicas, regressão completa do fluxo individual e plano de rollback validado.

### 0.4 Limite da auditoria atual

O repositório confirma o uso extensivo de `professional_id` nas telas e serviços de pacientes, evoluções, relatórios, backups e cobrança. A conexão disponível nesta revisão, porém, não possui permissão de leitura no projeto Supabase da Evolução Clínica. Por isso, o esquema e as políticas RLS do banco em produção ainda não são considerados inventariados; essa verificação será a primeira atividade do ambiente isolado.

---

## 1. Visão geral

O produto deverá ganhar um contexto empresarial para clínicas que concentre:

1. contratação de um plano com preço base + preço por licença;
2. criação e gerenciamento dos profissionais vinculados à clínica;
3. controle de convites, ocupação e disponibilidade de licenças;
4. cadastro de pacientes pertencentes ao espaço da clínica;
5. compartilhamento do mesmo paciente com mais de um profissional;
6. isolamento das evoluções, transcrições, relatórios e anotações de cada profissional;
7. auditoria e governança compatíveis com dados clínicos e LGPD.

As duas funcionalidades não devem ser construídas como recursos independentes. O compartilhamento de pacientes precisa nascer dentro do mesmo contexto empresarial que controla a equipe e as licenças. Assim, a clínica é o espaço de governança, o paciente é o recurso colaborativo e a evolução continua sendo um registro clínico do profissional que a produziu.

### Regra central

Um paciente pode estar vinculado a vários profissionais da mesma clínica, mas cada profissional mantém sua própria linha de evoluções. Compartilhar o paciente não significa compartilhar automaticamente o conteúdo clínico produzido por outra pessoa.

### Decisão de escopo inicial

O primeiro ciclo deve atender o compartilhamento **dentro de uma mesma clínica**. O mesmo nome, CPF ou paciente não deve ser automaticamente consolidado entre clínicas diferentes. Compartilhamento interclínicas, portal de família e troca de prontuário entre organizações ficam fora do primeiro ciclo e exigem consentimento, governança e contratos próprios.

---

## 2. Objetivos e não objetivos

### Objetivos

- Permitir que uma clínica compre uma quantidade contratada de licenças.
- Permitir que uma conta empresarial convide e desative profissionais sem depender do administrador global da plataforma.
- Impedir a criação de usuários profissionais acima da quantidade de licenças disponíveis.
- Permitir que um paciente da clínica seja atribuído a um ou vários profissionais.
- Preservar o vínculo `professional_id` das evoluções para manter autoria, assinatura e responsabilidade clínica.
- Garantir que cada profissional veja seus próprios registros clínicos por padrão.
- Permitir que a clínica acompanhe equipe, ocupação, pacientes, status contratual e auditoria.
- Manter os usuários individuais atuais funcionando sem obrigá-los a migrar para uma clínica.

### Não objetivos do primeiro ciclo

- Não criar um prontuário global compartilhado entre organizações.
- Não liberar automaticamente ao gestor empresarial o texto das evoluções dos profissionais.
- Não duplicar o paciente para cada profissional.
- Não transformar a clínica em um usuário compartilhado.
- Não implementar agora agenda, faturamento de convênios, folha de pagamento ou comissão profissional.
- Não permitir que o frontend decida sozinho quem pode acessar um paciente ou uma evolução.
- Não alterar o comportamento atual de usuários individuais sem uma migração controlada.

---

## 3. Ponto de partida atual e lacunas

O produto atual foi estruturado principalmente no modelo individual:

- `professionals` representa o perfil ligado ao usuário autenticado;
- os papéis atuais são essencialmente `admin` e `therapist`;
- `patients` usa `professional_id` como proprietário direto;
- `evolutions` possui `patient_id` e `professional_id`;
- relatórios e outras funções clínicas também dependem do profissional autenticado;
- os planos atuais são individuais, como mensal e anual;
- as políticas RLS partem da relação direta entre `auth.uid()` e `professional_id`.

Esse modelo não é suficiente para uma clínica porque um paciente não pode continuar tendo apenas um proprietário profissional. Também não é seguro substituir simplesmente o proprietário pelo `organization_id`: isso faria todos os profissionais da clínica enxergarem todos os registros clínicos.

A evolução empresarial deve, portanto, adicionar uma camada de organização e associação sem remover a autoria profissional.

---

## 4. Conceitos funcionais

### 4.1 Clínica / organização

É o espaço empresarial contratado. Possui identidade própria, dados cadastrais, contrato, quantidade de licenças, equipe, pacientes e regras de acesso.

Uma organização não deve ser confundida com uma conta de usuário. Ela pode ter vários usuários e um usuário pode participar de mais de uma organização, desde que o contexto ativo seja explícito.

### 4.2 Gestão empresarial sem papel global

A administração da clínica será concedida pela associação ativa do usuário à organização, e não por um novo valor em `professionals.role`. Um `owner` ou `manager` poderá:

- configurar a organização;
- visualizar o contrato e a ocupação de licenças;
- convidar, ativar, suspender e remover profissionais;
- criar e distribuir pacientes entre profissionais;
- consultar indicadores operacionais;
- abrir solicitações de suporte em nome da clínica.

Os profissionais continuam sendo usuários clínicos, normalmente com papel global `therapist`, e recebem permissões empresariais somente por meio da associação à organização. Essa separação evita que uma permissão de uma clínica seja reutilizada indevidamente em outra e mantém o fluxo individual atual compatível.

### 4.3 Membro da organização

É a relação entre um usuário e uma clínica. A associação deve possuir papel próprio, independente do papel global do usuário:

- `owner`: responsável contratual e administrativo principal;
- `manager`: gestor empresarial autorizado pela clínica;
- `professional`: profissional que consome uma licença e atende pacientes;

No primeiro MVP, somente `owner`, `manager` e `professional` serão modelados. `clinical_supervisor` e `assistant` serão adicionados futuramente por migration específica, depois que suas permissões e implicações clínicas estiverem aprovadas.

### 4.4 Licença

Licença é a capacidade contratada para um usuário profissional. A conta empresarial pode existir sem consumir uma licença profissional. A política definida para o MVP é:

- `owner` e `manager`: não consomem licença quando exercem apenas função administrativa;
- qualquer membro com capacidade clínica ativa, inclusive `owner` ou `manager`: consome uma licença;
- convite pendente: reserva uma licença para impedir excesso de contratação durante o período de convite.

Essa regra deve ser garantida transacionalmente no banco e nunca calculada apenas pela interface.

### 4.5 Paciente da clínica

É o cadastro clínico pertencente ao espaço da organização. Ele deve existir uma única vez dentro da clínica e ser associado a vários profissionais por uma tabela de atribuição.

Não haverá uma cópia do paciente por profissional. Nome, data de nascimento, contatos e dados cadastrais compartilháveis permanecem no cadastro comum; evoluções e anotações profissionais permanecem isoladas.

O cadastro administrativo pertence à clínica, mas sua edição seguirá o menor privilégio:

- `owner` e `manager`: podem criar e editar dados administrativos, atribuir e reatribuir profissionais;
- profissional primário: `can_edit_demographics = true` por padrão;
- profissional secundário: `can_edit_demographics = false` por padrão;
- consultant: `can_edit_demographics = false` por padrão.

Permissão para editar dados cadastrais não concede acesso ao conteúdo clínico privado.

### 4.6 Atribuição profissional

É a relação entre um paciente da clínica e um profissional. Deve registrar quem concedeu o acesso, quando começou, qual o estado atual e quando terminou.

Estados previstos:

- `active`: profissional atualmente vinculado;
- `paused`: vínculo temporariamente suspenso;
- `revoked`: acesso encerrado;
- `pending`: atribuição aguardando aceite, quando a clínica exigir confirmação.

### 4.7 Evolução privada por autoria

Uma evolução criada por um profissional deve continuar vinculada ao seu `professional_id`, mesmo que o paciente esteja compartilhado com outras pessoas.

Regra padrão:

- o autor pode criar, ler, editar e assinar suas próprias evoluções, conforme o estado do documento;
- outro profissional que atende o mesmo paciente não vê o conteúdo da evolução do colega;
- o gestor empresarial vê metadados operacionais, como quantidade e status, mas não o conteúdo clínico por padrão;
- acesso de supervisão clínica será uma permissão futura, explícita, auditada e limitada.

### 4.8 Contextos pessoal e de clínica

Uma conta existente pode manter simultaneamente o contexto pessoal e uma ou mais clínicas. Ao aceitar um convite:

- a conta individual não é convertida permanentemente em conta de clínica;
- pacientes e evoluções pessoais não são migrados, vinculados ou duplicados;
- a assinatura pessoal não é incorporada automaticamente à assinatura da clínica;
- dados de contextos diferentes não são consolidados silenciosamente;
- o usuário escolhe explicitamente entre **Minha conta** e cada clínica disponível.

Qualquer transferência futura de paciente pessoal para uma clínica exigirá fluxo próprio, confirmação explícita, autorização, auditoria e tratamento dos registros anteriores. Esse fluxo está fora do MVP.

### 4.9 Imutabilidade do contexto clínico

O contexto organizacional de um artefato clínico é definido no momento de sua criação e não pode ser alterado silenciosamente depois. Trocar o contexto ativo, acessar outra clínica, sair da organização ou reatribuir o paciente jamais poderá modificar retrospectivamente:

- `organization_id`;
- `organization_patient_id`;
- `professional_id` do autor;
- autoria e assinatura;
- histórico do registro.

Uma transferência formal futura deverá ser um processo específico, auditado e juridicamente definido.

---

## 5. Modelo de dados proposto

Os nomes abaixo são uma proposta de arquitetura. Antes da implementação devem ser convertidos em migrations idempotentes, com revisão das tabelas atuais e dos seus índices.

### 5.1 `organizations`

Representa a clínica.

Campos principais:

- `id` UUID;
- `legal_name` razão social;
- `trade_name` nome fantasia;
- `document_number` CNPJ ou identificador empresarial, com proteção e unicidade quando aplicável;
- `contact_email`, `contact_phone`;
- `operational_status`: `pending_setup`, `active`, `restricted`, `archived`;
- `timezone` e `locale`;
- `created_by`;
- `created_at`, `updated_at`.

O cadastro da organização não deve armazenar senhas. Autenticação continua pertencendo ao Supabase Auth.

### 5.2 `organization_memberships`

Relaciona profissionais e gestores às clínicas.

Campos principais:

- `id`;
- `organization_id`;
- `professional_id` referenciando o perfil atual;
- `membership_role`;
- `status`: `active`, `suspended`, `removed`;
- `clinical_access_enabled`, indicando se a pessoa também pode atender dentro da clínica;
- `seat_required`, derivado da capacidade clínica e não editável livremente pelo frontend;
- `invited_by`;
- `joined_at`, `suspended_at`, `removed_at`;
- `created_at`, `updated_at`.

Restrições:

- uma única associação ativa do mesmo usuário para a mesma organização;
- pelo menos um `owner` ativo por organização;
- não permitir remoção do último `owner` sem transferência de propriedade;
- permitir que `owner` ou `manager` também tenha capacidade clínica sem criar uma segunda conta;
- exigir licença ativa para qualquer associação com `clinical_access_enabled = true`;
- o estado da associação é a fonte de verdade para acesso empresarial.

### 5.3 `organization_invitations`

Controla o convite de novos usuários.

Campos principais:

- `id`;
- `organization_id`;
- `email` normalizado;
- `membership_role`;
- `clinical_access_enabled`;
- `token_hash`, nunca o token puro;
- `status`: `pending`, `accepted`, `expired`, `revoked`;
- `expires_at`;
- `invited_by`;
- `accepted_by`;
- `accepted_at`;
- `created_at`.

O convite deve ser de uso único, ter validade curta, permitir revogação e não revelar dados da clínica para quem não o aceitou.

### 5.4 `organization_subscriptions`

Representa a assinatura empresarial e não deve depender apenas de `professionals.subscription_plan`.

Campos principais:

- `organization_id`;
- `plan_id`;
- `billing_interval`: mensal ou anual;
- `base_price` e `seat_price` como snapshots do contrato;
- `minimum_contracted_seats`, inicialmente igual a 3;
- `contracted_seats`;
- `reserved_seats`;
- `active_seats`;
- `available_seats`, calculado e nunca editado diretamente;
- `stripe_customer_id`;
- `stripe_subscription_id`;
- identificadores dos itens recorrentes base e licença;
- `financial_status`: `trialing`, `active`, `past_due`, `canceled`, `unpaid`;
- `grace_period_ends_at`;
- `cancel_at_period_end`;
- `current_period_start`, `current_period_end`;
- `canceled_at`;
- `created_at`, `updated_at`.

O snapshot de preço é necessário para preservar o contrato histórico quando o preço público do plano mudar.

Os quatro conceitos de ocupação são distintos:

```text
available_seats = contracted_seats - active_seats - reserved_seats
```

- `contracted_seats`: quantidade contratada e confirmada pela cobrança, sempre igual ou superior a 3;
- `active_seats`: membros ativos com `clinical_access_enabled = true`;
- `reserved_seats`: convites clínicos pendentes, válidos e ainda não aceitos;
- `available_seats`: saldo efetivamente utilizável.

Exemplo: 5 licenças contratadas, 3 profissionais clínicos ativos e 1 convite clínico pendente resultam em 1 licença disponível.

`reserved_seats`, `active_seats` e `available_seats` devem ser calculados das fontes de verdade, ou mantidos somente por funções transacionais protegidas; o navegador não poderá atualizar contadores diretamente. A reserva ou ativação deverá bloquear concorrência no banco para impedir dois convites de ocuparem a última vaga simultaneamente.

### 5.5 `organization_patients`

Relaciona o cadastro de paciente ao espaço da clínica.

Campos principais:

- `id`;
- `organization_id`;
- `patient_id`;
- `status`: `active`, `archived`, `deleted`;
- `created_by`;
- `created_at`, `updated_at`.

Restrição recomendada: `UNIQUE (organization_id, patient_id)`.

No primeiro ciclo, o paciente empresarial pertence a uma única organização. O mesmo indivíduo em outra clínica deve ser um registro separado até que exista um fluxo formal de interoperabilidade e consentimento.

### 5.6 `patient_professional_assignments`

Controla quais profissionais atendem determinado paciente.

Campos principais:

- `id`;
- `organization_patient_id`;
- `professional_id`;
- `assignment_role`: `primary`, `secondary`, `consultant`;
- `status`;
- `can_edit_demographics`;
- `can_create_evolution`;
- `can_view_shared_summary`;
- `assigned_by`;
- `assigned_at`, `revoked_at`;
- `created_at`, `updated_at`.

Restrições:

- no máximo uma atribuição ativa do mesmo profissional ao mesmo paciente da clínica;
- exatamente um vínculo `primary` ativo para cada paciente ativo da clínica;
- o profissional atribuído deve possuir associação clínica ativa e licença válida na mesma organização;
- `primary` recebe `can_edit_demographics = true` por padrão;
- `secondary` e `consultant` recebem `can_edit_demographics = false` por padrão;
- revogação de atribuição não apaga evoluções nem altera o autor dos registros existentes.

No MVP, `can_create_evolution` pode ser verdadeiro para profissionais ativos e `can_view_shared_summary` falso até existir uma especificação de resumos compartilhados. O modelo deve evitar presumir que qualquer resumo é seguro para todos.

### 5.7 Evoluções e artefatos clínicos

As tabelas existentes de evoluções, relatórios, rascunhos e assinaturas devem continuar preservando:

- `professional_id` como autor;
- `patient_id` como paciente;
- data, status e assinatura do registro.

Para o contexto de clínica, é obrigatório adicionar uma referência explícita ao vínculo da organização, como `organization_id` ou `organization_patient_id`, preservando a compatibilidade do histórico legado. Essa referência é gravada no momento da criação e não pode ser alterada silenciosamente depois. Mudança de contexto ativo, reatribuição, suspensão ou desligamento não modificam retrospectivamente organização, paciente organizacional, autor, assinatura ou histórico.

Também devem ser revisadas, uma a uma, as entidades que hoje usam apenas `patient_id`:

- evoluções;
- relatórios de paciente;
- rascunhos de evolução;
- notas rápidas;
- lembretes de sessão;
- documentos Google associados;
- embeddings e busca semântica;
- exportações e logs de auditoria.

Cada entidade deverá declarar se é:

1. privada do profissional;
2. compartilhada no cadastro da clínica;
3. visível somente para gestores;
4. visível apenas com permissão clínica especial.

### 5.8 `organization_audit_logs`

Registro imutável das ações administrativas e excepcionais da clínica.

Campos principais:

- `id`, `organization_id` e `actor_professional_id`;
- `action`, `target_type` e `target_id`;
- `result` e metadados estritamente operacionais;
- `request_id`, `ip_hash` quando necessário e `created_at`;
- nunca armazenar texto clínico, token, segredo ou payload integral de integração.

O cliente poderá consultar apenas eventos autorizados. A inclusão será feita por funções ou backend confiável, sem permissão de `UPDATE` ou `DELETE` para membros da clínica.

### 5.9 `patient_sharing_records`

Registro versionado da base e da comunicação de privacidade usada para o compartilhamento interno do cadastro do paciente.

Campos principais:

- `organization_patient_id`;
- `legal_basis` e `purpose` aprovados para o fluxo;
- `notice_version` e, quando aplicável, `consent_status`;
- ator que registrou, origem, `recorded_at`, `revoked_at` e justificativa operacional;
- referência ao documento aplicável, sem copiar conteúdo clínico para o registro.

A base legal e a redação final não serão presumidas pela equipe técnica. O modelo apenas garante rastreabilidade para a decisão jurídica aprovada.

Estado documental atual:

```text
privacy_text_status = draft_pending_legal_review
```

Texto operacional provisório, restrito à especificação e homologação:

> Este paciente será incluído no ambiente da clínica e poderá ter seus dados cadastrais acessados pelos profissionais autorizados responsáveis por seu atendimento. Registros clínicos produzidos por cada profissional permanecem sujeitos às permissões definidas na plataforma.

Esse texto não constitui validação jurídica e não autoriza o uso de dados reais antes da aprovação do gate clínico.

---

## 6. Plano empresarial e regra de cobrança

### 6.1 Produto comercial

Adicionar o **Plano Clínica**, com código interno preferencial `clinic` e modelo `base_plus_seat`, sem reutilizar `monthly` e `yearly` individuais. O identificador `enterprise` não será o nome principal e fica reservado para futuros contratos de maior porte, customizados ou destinados a redes.

Campos comerciais necessários no cadastro de planos:

- nome e descrição comercial;
- modelo de cobrança `base_plus_seat`;
- preço base;
- preço unitário por licença;
- periodicidade;
- quantidade mínima de licenças;
- quantidade máxima, se houver;
- texto de benefícios;
- IDs de produto e preços do Stripe;
- status de venda;
- ordem de exibição.

Configuração comercial inicial aprovada:

| Catálogo | Base | Por licença clínica | Mínimo | Total no mínimo |
|---|---:|---:|---:|---:|
| `clinic_monthly` | R$ 49,90/mês | R$ 29,90/mês | 3 | R$ 139,60/mês |
| `clinic_yearly` | R$ 499,00/ano | R$ 299,00/ano | 3 | R$ 1.396,00/ano |

Esses valores são parâmetros de catálogo centralizado, não constantes espalhadas pela aplicação. IDs reais de produto, preço e webhook do Stripe serão configurados por ambiente e nunca expostos de forma insegura no frontend.

### 6.2 Fórmula inicial

```text
total do período = preço base do período + (licenças contratadas × preço por licença)
```

Exemplos aprovados para o mínimo de 3 licenças:

```text
Mensal: R$ 49,90 + (3 × R$ 29,90) = R$ 139,60/mês
Anual:  R$ 499,00 + (3 × R$ 299,00) = R$ 1.396,00/ano
```

O contrato e a interface devem informar claramente:

- membros exclusivamente administrativos não consomem licença;
- qualquer membro com capacidade clínica ativa consome licença;
- convites clínicos pendentes e válidos reservam licença;
- se a redução de licenças só vale no próximo ciclo;
- como funciona o excedente;
- como funcionam `past_due`, os 7 dias de tolerância e o estado `restricted`.

### 6.3 Sincronização com cobrança

O Stripe deve ser a origem do evento financeiro, enquanto o banco da aplicação mantém o estado operacional necessário para autorização.

Fluxo recomendado:

1. criar o cliente empresarial;
2. criar a assinatura com dois itens recorrentes: base e licenças;
3. persistir os IDs retornados;
4. ajustar a quantidade do item de licenças quando a clínica comprar ou liberar lugares;
5. processar webhooks idempotentes;
6. atualizar o estado financeiro apenas após confirmação do evento;
7. registrar histórico de alterações de assento e preço.

Nenhuma tela deve liberar licenças apenas porque o pagamento foi iniciado no navegador.

### 6.4 Inadimplência e continuidade assistencial

Uma falha de pagamento inicia o estado financeiro `past_due`. Durante os primeiros 7 dias:

- login, atendimento e acesso aos registros clínicos existentes permanecem disponíveis;
- criação e consulta necessárias à continuidade assistencial não são interrompidas abruptamente;
- o `owner` recebe avisos claros sobre a pendência;
- aumento de licenças, contratação adicional, convites que exijam expansão e outras ações que aumentem a dívida podem ser bloqueados.

Depois da tolerância, a organização poderá entrar no estado operacional `restricted`. O modelo deve separar, sem presumir equivalência:

```text
status financeiro
status operacional da organização
direito de leitura
direito de escrita
direito de exportação
retenção
exclusão
```

As operações exatas disponíveis em `restricted` dependem de validação operacional e jurídica, mas inadimplência nunca apaga prontuários.

### 6.5 Cancelamento e retenção

No cancelamento voluntário, quando aplicável no Stripe:

```text
cancel_at_period_end = true
```

Até o fim do período contratado, equipe, pacientes e acesso clínico funcionam normalmente. Depois do término, a assinatura passa a cancelada e a organização poderá ser arquivada ou restringida conforme política operacional.

São processos independentes:

```text
cancelar assinatura
arquivar organização
restringir operação
exportar dados
solicitar exclusão
executar exclusão autorizada
```

Decisão atual:

```text
automatic_clinical_deletion = false
retention_policy = legal_review_pending
```

Nenhum prazo de 90 dias, 180 dias ou qualquer quantidade de anos será adotado sem revisão jurídica e regulatória. A arquitetura futura deverá aceitar políticas de retenção diferentes sem migration destrutiva dos dados existentes.

---

## 7. Fluxos funcionais

### 7.1 Contratação e criação da clínica

1. O comprador escolhe o Plano Clínica mensal ou anual e no mínimo 3 licenças clínicas.
2. O checkout coleta dados da organização e do responsável.
3. Após confirmação, cria-se a organização e a associação `owner`.
4. A autorização empresarial passa a ser derivada dessa associação, sem alterar o papel global do usuário.
5. A assinatura e os assentos são gravados com status confirmado.
6. O usuário é direcionado ao onboarding empresarial.
7. A aplicação mostra um checklist: dados da clínica, equipe, licenças e pacientes.

### 7.2 Convite de profissional

1. O gestor acessa a equipe.
2. O sistema mostra `contracted_seats`, `active_seats`, `reserved_seats` e `available_seats`.
3. O gestor informa nome, e-mail e função.
4. Para capacidade clínica, o backend bloqueia concorrência, valida `available_seats > 0` e cria um convite de uso único que reserva a licença; convite administrativo não reserva assento.
5. O destinatário recebe um link seguro.
6. Se já possuir conta, aceita o vínculo; se não possuir, conclui o cadastro.
7. A associação vira `active` somente após autenticação e aceite.
8. O consumo de licença é atualizado de forma transacional.

### 7.3 Cadastro e compartilhamento de paciente

1. O gestor ou profissional autorizado cria o paciente no contexto da clínica.
2. O sistema cria o vínculo em `organization_patients`.
3. O gestor escolhe um profissional primário e, se necessário, profissionais secundários.
4. Cada vínculo é registrado em `patient_professional_assignments`.
5. O paciente aparece uma vez na lista da clínica.
6. Cada profissional vê o paciente em sua lista de trabalho, com a indicação do tipo de vínculo.
7. `owner`, `manager` e profissional primário podem editar o cadastro; secundário e consultant apenas consultam por padrão.

### 7.4 Criação da evolução

1. O profissional abre um paciente ao qual está atribuído.
2. O backend valida organização, associação ativa e permissão de criação.
3. A evolução é criada com o `professional_id` autenticado, nunca com um ID recebido livremente do frontend.
4. O histórico fica visível ao autor conforme as regras atuais.
5. Outro profissional do mesmo paciente não recebe acesso ao conteúdo por causa do compartilhamento.
6. Assinatura digital, hash, nome e registro profissional permanecem ligados ao autor.
7. Organização, paciente organizacional e autoria são gravados no momento da criação e não mudam quando o usuário troca de contexto.

### 7.5 Revogação ou saída de profissional

1. O gestor suspende ou remove o vínculo.
2. Novos acessos ao paciente são bloqueados imediatamente.
3. Evoluções já produzidas não são apagadas.
4. Os registros continuam vinculados ao autor e preservam sua assinatura.
5. A clínica pode atribuir o paciente a outro profissional.
6. A licença é liberada somente conforme a regra comercial e o estado do contrato.
7. A ação gera registro de auditoria.

### 7.6 Redução ou aumento de licenças

- aumento: atualizar quantidade contratada e permitir novas associações após confirmação;
- redução: impedir quantidade inferior a 3 ou inferior à soma de licenças ativas e reservadas;
- redução com excesso: solicitar desativação, transferência ou revogação de convites antes de confirmar;
- convite pendente: liberar ou cancelar a reserva explicitamente;
- alteração financeira: registrar quem solicitou, quando e qual foi o novo valor.

### 7.7 Falha de pagamento

1. O webhook confirmado altera o estado financeiro para `past_due` e define o fim da tolerância em 7 dias.
2. Durante a tolerância, a continuidade assistencial é preservada e o owner recebe avisos.
3. Operações que aumentem a dívida podem ser bloqueadas sem impedir abruptamente atendimento e consulta clínica.
4. Após o prazo, a organização pode entrar em `restricted`, conforme matriz operacional ainda sujeita a validação jurídica.
5. Nenhuma transição financeira exclui ou remove automaticamente prontuários.

### 7.8 Cancelamento voluntário

1. Quando aplicável, solicitar ao Stripe `cancel_at_period_end = true`.
2. Até `current_period_end`, manter o funcionamento contratado normalmente.
3. Após o período, registrar a assinatura como cancelada e tratar separadamente o estado operacional da organização.
4. Oferecer exportação conforme autorização e política aplicável.
5. Qualquer exclusão exige solicitação e processo próprios; nunca é consequência automática do cancelamento.

### 7.9 Aceite de convite por usuário individual

1. O usuário aceita o vínculo sem perder ou converter seu contexto pessoal.
2. Nenhum paciente, evolução ou plano individual é migrado para a clínica.
3. A nova clínica passa a aparecer no seletor explícito de contexto.
4. Consultas e gravações usam conjuntamente usuário autenticado, organização ativa, membership, papel, capacidade clínica e atribuição necessária.
5. Uma permissão na Clínica ABC não concede acesso à Clínica XYZ.

---

## 8. Permissões e privacidade

### Matriz inicial

| Ação | Owner/Manager | Profissional atribuído | Profissional não atribuído | Admin da plataforma |
|---|---:|---:|---:|---:|
| Gerenciar dados da clínica | Sim | Não | Não | Suporte auditado |
| Convidar profissionais | Sim | Não | Não | Sim |
| Ver ocupação de licenças | Sim | Não | Não | Sim |
| Criar paciente da clínica | Sim | Não por padrão | Não | Suporte auditado |
| Ver cadastro básico do paciente | Sim | Sim | Não | Suporte auditado |
| Editar cadastro do paciente | Sim | Primário: sim; secundário/consultant: não por padrão | Não | Suporte auditado |
| Criar evolução | Não por padrão | Sim | Não | Não por padrão |
| Ler evolução de outro profissional | Não por padrão | Não por padrão | Não | Não por padrão |
| Ler suas próprias evoluções | Somente se também for profissional clínico e autor | Sim | Não | Não por padrão |
| Atribuir paciente | Sim | Conforme permissão | Não | Sim |
| Remover paciente da clínica | Sim, com confirmação | Não por padrão | Não | Sim |
| Ver auditoria empresarial | Sim, sem conteúdo clínico | Não | Não | Sim |

O papel organizacional de gestão administra a operação, sem receber acesso irrestrito ao prontuário clínico. Se um `owner` ou `manager` também tiver capacidade clínica, suas permissões clínicas seguem exatamente as regras de profissional atribuído e autoria; o papel administrativo não amplia esse acesso. Qualquer exceção futura de leitura clínica precisará ser uma permissão separada, com finalidade, consentimento e auditoria.

### RLS e backend

As políticas devem usar funções de segurança no banco, como:

- `is_platform_admin()`;
- `is_organization_member(organization_id)`;
- `has_organization_role(organization_id, roles[])`;
- `can_access_organization_patient(organization_patient_id)`;
- `can_create_evolution(patient_id)`;
- `can_read_evolution(evolution_id)`.

Regras obrigatórias:

- nunca confiar no `organization_id` enviado pelo navegador;
- derivar o usuário de `auth.uid()`;
- verificar associação ativa em todas as consultas sensíveis;
- verificar conjuntamente usuário autenticado, organização alvo, membership, papel, capacidade clínica e atribuição ao paciente quando aplicável;
- impedir que permissão ou membership de uma organização seja reutilizado para acessar outra;
- não usar `user_metadata` para autorização e não depender de um único papel de clínica gravado no JWT, pois associações podem mudar e um usuário pode participar de várias organizações;
- separar leitura do cadastro do paciente da leitura da evolução;
- impedir que uma política ampla de organização conceda leitura das evoluções;
- usar `USING` e `WITH CHECK` nas atualizações para impedir troca silenciosa de organização, paciente organizacional ou autoria;
- usar RPCs `SECURITY DEFINER` somente com `search_path` controlado e validação de permissão;
- conceder acesso às tabelas novas por grants mínimos explícitos, além de habilitar RLS;
- registrar alterações de membros, licenças, atribuições e exportações.

---

## 9. Ecossistema de telas

O dashboard empresarial previsto no `DASHBOARD_SPEC.md` deve ser concretizado em uma navegação própria, sem misturar todos os controles com o painel global de administrador.

### Área empresarial

- **Visão geral:** licenças, equipe ativa, convites, pacientes e pendências;
- **Minha clínica:** dados cadastrais, contatos e configurações;
- **Equipe:** listagem, convite, função, status, última atividade e ações;
- **Licenças e assinatura:** Plano Clínica, base, valor unitário, mínimo, consumo (`active`, `reserved`, `available`), histórico, alteração de quantidade e cobrança;
- **Pacientes:** diretório da clínica, filtros, profissionais vinculados e status;
- **Atribuições:** distribuição e redistribuição de pacientes;
- **Auditoria:** eventos administrativos sem exibir conteúdo clínico;
- **Suporte:** chamados vinculados ao contexto empresarial.

### Área do profissional

- seletor visual explícito entre **Minha conta** e cada clínica, quando o usuário tiver mais de um contexto;
- lista de pacientes próprios e pacientes da clínica aos quais está atribuído;
- badge informando se o paciente é pessoal, primário ou compartilhado;
- histórico de evoluções filtrado pelo profissional autenticado;
- nenhuma mudança silenciosa no fluxo individual atual.

### Estados que precisam de UX explícita

- sem licenças disponíveis;
- convite expirado;
- assinatura `past_due` dentro dos 7 dias de tolerância, sem interrupção abrupta da assistência;
- organização `restricted`, com direitos de leitura, escrita e exportação apresentados separadamente;
- cancelamento agendado para o fim do período e organização arquivada após o término;
- profissional removido com pacientes ainda atribuídos;
- paciente sem profissional primário;
- tentativa de abrir evolução de outro profissional;
- usuário pertencente a mais de uma clínica;
- contexto pessoal preservado após aceite de convite, sem migração automática de pacientes;
- falha de webhook ou divergência de quantidade de licenças.

---

## 10. Auditoria, LGPD e segurança operacional

Criar uma trilha de auditoria para, no mínimo:

- criação, alteração, suspensão e remoção de membros;
- emissão, aceite, revogação e expiração de convites;
- compra, aumento, redução e cancelamento de licenças;
- criação, atribuição e revogação de pacientes;
- exportação, compartilhamento ou alteração de permissões;
- acesso excepcional a conteúdo clínico, se essa função existir no futuro.

Cada evento deve registrar ator, organização, ação, entidade, identificador, data, origem e resultado. Não registrar texto clínico ou tokens em logs.

O produto deve prever:

- consentimento e finalidade para compartilhamento interno;
- aviso de privacidade específico para clínicas com status `draft_pending_legal_review` até aprovação;
- rastreabilidade de `notice_version`, `legal_basis`, `purpose`, `recorded_at`, `recorded_by`, `source`, `consent_status` e `revoked_at`;
- exportação, retenção e eventual exclusão como processos separados do cancelamento financeiro;
- `automatic_clinical_deletion = false` enquanto a política jurídica e regulatória estiver pendente;
- uso exclusivo de dados sintéticos na homologação enquanto o gate clínico não estiver aprovado;
- bloqueio de acesso após remoção de membro;
- proteção contra enumeração de e-mails e tokens de convite;
- rate limit para convites e tentativas de aceite;
- mascaramento de dados sensíveis em telas administrativas;
- revisão de todos os jobs, notificações e backups para respeitar o contexto empresarial.

---

## 10.1 Estratégia de implementação isolada

### Topologia dos ambientes

| Camada | Produção atual | Homologação de clínicas |
|---|---|---|
| Git | `main` | branch longa `feat/clinicas` e branches curtas derivadas dela |
| Vercel | projeto e domínio público atuais | projeto Vercel separado, ligado ao mesmo repositório e com `feat/clinicas` como branch de produção da homologação |
| Supabase | projeto atual, sem alterações durante o desenvolvimento | projeto Supabase de staging separado, sem dados reais e sem reutilização de credenciais de produção |
| Stripe | Live Mode atual | Test Mode com produtos, preços e webhook próprios |
| Mensageria | provedores e destinatários reais | envio bloqueado por padrão ou redirecionado para destinatários de teste autorizados |
| Analytics | propriedade de produção | desabilitado ou marcado com ambiente de homologação, sem misturar conversões |
| Android/TWA | continua apontando ao domínio público | validação inicial pelo navegador; nenhum novo `.aab` por mudanças apenas web/backend |

### Guardas obrigatórias antes de publicar a primeira Preview

1. A aplicação deve falhar de forma explícita quando `VITE_SUPABASE_URL` ou a chave pública esperada não estiverem configuradas; uma Preview nunca poderá usar valores de produção como fallback.
2. O backend deve recusar inicialização em homologação se detectar URL, service role, Stripe Live Mode ou origem pública de produção.
3. Variáveis da Vercel devem ser separadas por ambiente e revisadas por lista de nomes, sem registrar valores secretos neste documento ou nos logs.
4. URLs de redirecionamento do Supabase Auth e dos provedores OAuth devem aceitar apenas os domínios de homologação definidos.
5. A Preview deve exigir proteção de acesso e exibir um banner persistente de **Ambiente de homologação**.
6. E-mails, WhatsApp, n8n, webhooks, cron e push devem começar desativados; cada integração será liberada isoladamente com destinos de teste.
7. Serão usados somente usuários, clínicas, pacientes e documentos sintéticos.
8. A branch Git de clínicas somente será conectada ao projeto Vercel de homologação depois que as variáveis isoladas estiverem cadastradas; um deployment automático, sozinho, não constitui isolamento de banco.

### Estratégia de migrations e compatibilidade

- migrations iniciais serão aditivas: novas tabelas, índices, funções e colunas anuláveis;
- nenhuma coluna, constraint ou política usada pelo fluxo individual será removida ou reinterpretada no primeiro ciclo;
- tabelas expostas pela Data API terão grants mínimos explícitos e RLS habilitada; RLS e grants serão tratados como camadas independentes;
- políticas usarão associação ativa, contexto de organização validado no banco e `(select auth.uid())`, com índices nas colunas usadas por RLS e chaves estrangeiras;
- funções privilegiadas ficarão fora do schema exposto quando possível, com `search_path` fixo e `EXECUTE` revogado de papéis que não precisem delas;
- views expostas usarão `security_invoker = true` quando aplicável;
- cada migration terá verificação de aplicação, teste de repetição quando pertinente e caminho de correção para frente; rollback não dependerá de apagar dados clínicos;
- o fluxo individual será exercitado em toda fase, não apenas antes do lançamento.

### Promoção e rollback

1. Implementar e testar em `feat/clinicas` com banco isolado.
2. Abrir Pull Request para `main` somente com build, testes, revisão de RLS e checklist de integrações aprovados.
3. Aplicar primeiro migrations aditivas compatíveis, mantendo a feature flag desligada.
4. Publicar o código compatível e executar smoke tests do fluxo individual.
5. Ativar a funcionalidade apenas para uma organização piloto.
6. Expandir gradualmente depois de observar erros, auditoria, cobrança e negações de acesso.
7. Em incidente, desligar a feature flag e reverter a aplicação para um deployment conhecido; dados já persistidos permanecem preservados e eventuais correções de banco são feitas por nova migration.

---

## 11. Plano de implementação futuro

### Fase 0 — Decisões e especificação de segurança — concluída

- Plano Clínica, código `clinic` e modelo `base_plus_seat` aprovados;
- catálogos mensal e anual, preços, mínimo de 3 licenças e fórmula aprovados;
- ocupação por licenças contratadas, ativas, reservadas e disponíveis definida;
- tolerância de 7 dias, estados `past_due` e `restricted` e continuidade assistencial definidos;
- cancelamento financeiro separado de arquivamento, restrição, exportação, retenção e exclusão;
- contextos pessoal e de múltiplas clínicas, sem migração automática, definidos;
- governança cadastral e isolamento do conteúdo clínico definidos;
- imutabilidade do contexto organizacional dos artefatos clínicos definida;
- gates de ambiente, segurança, validação jurídica e produção preservados.

**Encerramento:** a Fase 0 está documentalmente consolidada. Nenhuma funcionalidade, migration ou configuração de produção faz parte deste encerramento.

### Pré-requisitos operacionais antes da Fase 1 — não executados

O diagnóstico, a matriz de ambientes, as variáveis, as guardas planejadas e os bloqueios estão consolidados em [`FASE_0_5_PREPARACAO_AMBIENTE_HOMOLOGACAO_CLINICAS.md`](FASE_0_5_PREPARACAO_AMBIENTE_HOMOLOGACAO_CLINICAS.md). A branch remota `feat/clinicas` não deve ser publicada até o encerramento dos bloqueios P0 ali registrados.

- remover qualquer fallback que permita a uma build de homologação conectar-se silenciosamente ao Supabase de produção;
- configurar `feat/clinicas`, projeto Vercel de homologação protegido e Supabase de staging isolado;
- inventariar o esquema real, constraints, funções, triggers, grants, RLS, Storage, Edge Functions e jobs;
- configurar produtos, preços e webhooks próprios no Stripe Test Mode;
- preparar dados sintéticos e matriz automatizada de testes de autorização;
- manter dados reais bloqueados até a aprovação jurídica prevista no gate clínico.

**Gate:** observar os gates técnico, de cobrança, clínico e de produção definidos na seção 0.3.

### Fase 1A — Desenho técnico da fundação empresarial — concluída documentalmente

O desenho técnico foi consolidado em [`FASE_1A_DESENHO_FUNDACAO_EMPRESARIAL.md`](FASE_1A_DESENHO_FUNDACAO_EMPRESARIAL.md). A Fase 1A define contexto único por sessão/Auth staging, memberships referenciados ao perfil `professionals`/`auth.uid()`, aceite seguro de convites, bootstrap sanitizado e feature flag global + por organização. Nenhuma tabela, migration ou funcionalidade empresarial foi aplicada.

### Fase 1B0 — Bootstrap individual sanitizado — aplicada em staging, aprovada para revisão

O baseline `20260914-individual-core-v1` foi aplicado exclusivamente no Supabase staging e está documentado em [`FASE_1B0_BOOTSTRAP_STAGING.md`](FASE_1B0_BOOTSTRAP_STAGING.md). Ele reproduz somente as tabelas e RLS necessárias ao fluxo individual, sem dados, Auth persistente, Storage, Vault, cron, integrações ou objetos empresariais. A Fase 1B1 foi implementada em staging conforme seção seguinte e permanece sujeita à revisão formal antes de qualquer expansão de escopo.

**Gate para implementação:** aprovação do desenho, baseline staging sanitizado, matriz RLS/grants, testes de concorrência de convites e validação de rollback. As URLs/Auth, DNS, Vercel, secrets e integrações da Fase 0.5 permanecem fora de escopo.

### Fase 1B1 — Fundação de organizações e memberships — revisada e endurecida em staging

O artefato controlado [`20260915_01_organizations_memberships.sql`](../supabase/clinic-migrations/20260915_01_organizations_memberships.sql) foi aplicado exclusivamente no staging `hwkdwinfckmjoriqxbjk` e documentado em [`FASE_1B1_FUNDACAO_ORGANIZACOES_MEMBERSHIPS.md`](FASE_1B1_FUNDACAO_ORGANIZACOES_MEMBERSHIPS.md). A implementação cobre somente `organizations`, `organization_memberships`, autorização, invariantes de owner, grants, RLS e o smoke multi-tenant. A criação de convites, billing, pacientes compartilhados, UI e produção permanece fora de escopo.

O smoke Auth/RLS passou com A/B/C/D, cleanup sem resíduos e baseline individual preservado. A revisão 1B1.1 também endureceu a seleção de memberships históricos na transferência de owner, formalizou owner anterior como manager com preservação de `clinical_access_enabled` e passou a matriz de estados, autorização e concorrência. O enforcement server-side de feature flag permanece gate obrigatório antes de produção. O resultado é **FASE 1B1 REVISADA E ENDURECIDA — APTO PARA FASE 1B2**, sem iniciar a Fase 1B2 nem concluir a Fase 1 empresarial.

### Fase 1B2 — Feature gates e convites — revisada e endurecida em staging, aguardando revisão

Os artefatos controlados [`20260915_03_clinic_feature_gates.sql`](../supabase/clinic-migrations/20260915_03_clinic_feature_gates.sql), [`20260915_04_organization_invitations.sql`](../supabase/clinic-migrations/20260915_04_organization_invitations.sql) e [`20260915_05_harden_runtime_environment.sql`](../supabase/clinic-migrations/20260915_05_harden_runtime_environment.sql) foram aplicados exclusivamente no staging `hwkdwinfckmjoriqxbjk` e estão documentados em [`FASE_1B2_FEATURE_GATES_E_CONVITES.md`](FASE_1B2_FEATURE_GATES_E_CONVITES.md). A entrega cobre gate global DB-side deny-by-default com identidade privada real do ambiente, flag `clinic` por organização, RLS/grants, emissão/revogação/aceite de convites, expiração lógica, visibilidade mínima para manager e testes sintéticos de abuso, concorrência e isolamento. A flag global voltou a OFF após o smoke; produção, UI, envio real, billing, seats, pacientes compartilhados e Fase 1B3 permanecem fora do escopo.

O resultado é **FASE 1B2 REVISADA E ENDURECIDA — APTO PARA FASE 1B3**, não conclusão da Fase 1 empresarial. Antes de produção ainda são obrigatórios o envio server-side sem retorno de raw token ao cliente, identidade explícita `production` em bootstrap próprio, enforcement operacional de `CLINIC_FEATURE_ENABLED`, ativação administrativa auditada por organização, gates jurídicos e as fases posteriores de licenças e pacientes compartilhados. A Fase 1B3 não foi iniciada.

### Fase 1 — Fundação de organização e identidade

- criar `organizations`, `organization_memberships` e `organization_invitations`;
- manter `admin` e `therapist` e derivar papéis empresariais das associações à organização;
- criar funções de autorização e RLS;
- construir onboarding mínimo da clínica;
- validar convite, aceite, suspensão e transferência de owner.

### Fase 2 — Assinatura empresarial e licenças

- adicionar o plano `clinic` e os catálogos `clinic_monthly` e `clinic_yearly`;
- criar `organization_subscriptions`;
- implementar cobrança base + item de licença;
- integrar webhooks idempotentes;
- bloquear convites e ativações sem `available_seats`;
- implementar `past_due`, tolerância de 7 dias, `restricted` e cancelamento no fim do período;
- criar telas de quantidade, consumo e histórico com preços parametrizados.

### Fase 3 — Pacientes compartilhados

- criar `organization_patients`;
- criar `patient_professional_assignments`;
- revisar queries atuais que filtram somente por `professional_id`;
- adaptar cadastro, lista, dashboard e detalhe do paciente;
- aplicar edição cadastral para gestor/primário e somente leitura para secundário/consultant por padrão;
- preservar pacientes pessoais sem migração, vínculo ou duplicação automáticos;
- garantir que a mesma pessoa não seja duplicada para cada profissional.

### Fase 4 — Evoluções isoladas

**Validada exclusivamente no staging**, branch `feat/clinicas`, build
`v1.10.890`; migrations 26–27 aplicadas, smoke completo final PASS,
cleanup zero e gate OFF. Ver [evidências e limitações](FASE_4_EVOLUCOES_ISOLADAS.md).

- revisar RLS de evoluções, relatórios, rascunhos e buscas;
- manter autoria profissional obrigatória;
- testar criação simultânea por dois profissionais;
- impedir leitura cruzada por padrão;
- impedir alteração retrospectiva do contexto organizacional, paciente organizacional e autoria;
- revisar assinaturas, hashes, exportações e notificações.

### Fase 5 — Ecossistema empresarial

- consolidar dashboard empresarial;
- implementar auditoria;
- implementar gestão de pacientes e reatribuição;
- adicionar indicadores operacionais;
- documentar, sem implementar, a futura extensão para supervisor e assistente;
- documentar suporte e recuperação de conta.

### Fase 6 — Homologação e lançamento controlado

- executar testes de segurança com dois profissionais e duas clínicas;
- habilitar um piloto interno com dados sintéticos e, somente após o gate jurídico, um piloto controlado com dados reais;
- validar cobrança real e falhas de webhook;
- testar cancelamento, downgrade e remoção de usuário;
- confirmar que nenhum dado clínico cruza a fronteira indevida;
- liberar por feature flag ou organização piloto;
- só depois expandir comercialmente.

---

## 12. Critérios de aceite

### Fase 0 documental

- **Plano Clínica** é o nome comercial aprovado, `clinic` é o código interno preferencial e `base_plus_seat` é o modelo de cobrança.
- O mínimo de contratação é 3 licenças clínicas.
- Os preços mensal e anual estão documentados e serão parametrizados em catálogo centralizado.
- O período de tolerância aprovado é de 7 dias.
- Inadimplência não apaga dados clínicos e cancelamento financeiro não equivale a exclusão.
- Não existe exclusão automática de prontuários enquanto a política jurídica estiver pendente.
- Dados reais continuam bloqueados até aprovação jurídica dos textos aplicáveis.

### Assinatura e licenças

- O preço total exibe base, unidade, quantidade de licenças e mínimo contratual.
- O checkout cria e mantém a assinatura empresarial correta.
- Membros exclusivamente administrativos não consomem licença.
- Convites clínicos pendentes reservam licença.
- `available_seats` desconta `active_seats` e `reserved_seats` de `contracted_seats`.
- Não é possível ativar ou reservar mais profissionais do que as licenças contratadas.
- Webhooks repetidos não duplicam assentos ou transações.
- `past_due` preserva continuidade assistencial durante 7 dias, e `restricted` não implica exclusão.
- Cancelamento no fim do período mantém funcionamento normal até `current_period_end`.

### Usuários

- `owner` e `manager` conseguem administrar a clínica sem acessar conteúdo clínico por causa do papel administrativo.
- Um profissional pode manter contexto pessoal e participar de múltiplas clínicas.
- Aceitar convite não migra pacientes, evoluções ou assinatura pessoais.
- O seletor de contexto é explícito e a autorização sempre considera a organização alvo.
- Convites são únicos, expiram e podem ser revogados.
- A remoção de um membro invalida seus novos acessos imediatamente.
- O último owner não pode ser removido sem transferência.

### Pacientes e evoluções

- Um paciente aparece uma única vez no diretório da clínica.
- O mesmo paciente pode ter vários profissionais ativos.
- Owner, manager e profissional primário podem editar o cadastro compartilhado.
- Profissional secundário e consultant não editam o cadastro por padrão.
- Dois profissionais conseguem criar evoluções independentes para o mesmo paciente.
- Cada profissional vê suas próprias evoluções.
- Um profissional não vê a evolução de outro sem permissão explícita.
- A revogação de um vínculo não apaga histórico nem altera autoria.
- O contexto organizacional de um registro clínico criado é imutável.

### Segurança

- Consultas sem organização ou associação válida retornam vazio/negado.
- Alterar IDs no frontend não permite acessar dados de outro contexto.
- Todas as ações administrativas relevantes aparecem na auditoria.
- Exportações e relatórios respeitam o mesmo escopo das evoluções.

---

## 13. Registro das decisões que antes estavam em aberto

| Questão original | Decisão |
|---|---|
| Qual é o nome e o código do plano? | **Plano Clínica**, código `clinic`; `enterprise` fica reservado para uma oferta futura distinta. |
| Quais são os preços? | Mensal: R$ 49,90 base + R$ 29,90 por licença. Anual: R$ 499,00 base + R$ 299,00 por licença. Catálogo centralizado. |
| Quem consome licença? | Apenas `clinical_access_enabled = true`; gestor exclusivamente administrativo não consome. |
| Convite pendente ocupa vaga? | Convite clínico pendente e válido reserva licença; convite administrativo não reserva. |
| Existe mínimo de licenças? | Sim, 3 licenças clínicas contratadas. |
| Como é calculada a disponibilidade? | `available_seats = contracted_seats - active_seats - reserved_seats`. |
| O preço muda por função? | Não no MVP, pois existe apenas uma categoria clínica que consome licença. |
| Gestor vê evoluções? | Não no MVP, nem em supervisão. |
| Quantos owners? | Um owner principal; transferência auditada. |
| Uma conta participa de várias clínicas? | Sim, mantendo também o contexto pessoal e usando seletor explícito. |
| Aceitar convite migra pacientes pessoais? | Não. Pacientes, evoluções e assinatura pessoais permanecem no contexto original. |
| O paciente pode aparecer em outra clínica? | Apenas como cadastro independente; sem vínculo ou consolidação entre organizações. |
| Como registrar consentimento? | Registro versionado de finalidade, ator, data e origem; redação jurídica ainda pendente. |
| Profissional primário é obrigatório? | Sim para paciente ativo da clínica. |
| Quem edita o cadastro compartilhado? | Owner, manager e primário; secundário e consultant ficam em somente leitura por padrão. |
| Pode haver reatribuição? | Sim, sem transferir autoria ou conteúdo histórico. |
| O contexto de um registro pode mudar? | Não silenciosamente. Organização, paciente organizacional, autor, assinatura e histórico são imutáveis após a criação. |
| O que ocorre após cancelamento? | Funcionamento até o fim do período; depois, estado operacional separado, sem exclusão automática. |
| Existe tolerância de pagamento? | Sim, 7 dias em `past_due`, preservando continuidade assistencial; depois poderá ocorrer `restricted`. |
| Existe exclusão clínica automática? | Não. `automatic_clinical_deletion = false` enquanto a política jurídica estiver pendente. |
| Qual provedor de cobrança? | Stripe no MVP; faturamento manual fica fora do primeiro ciclo. |

As únicas pendências restantes estão concentradas na seção 0.2 e dizem respeito a validação jurídica/regulatória ou configuração externa. Nenhuma delas autoriza enfraquecer RLS, compartilhar conteúdo clínico, usar dados reais ou reutilizar o ambiente de produção na homologação.

---

## 14. Fase 1B3 — resultado validado

A Fase 1B3 foi concluída exclusivamente no Supabase staging `hwkdwinfckmjoriqxbjk`, na branch `feat/clinicas`, com os artefatos 06–08 já aplicados e verificados sem reaplicação. O lifecycle de memberships, rollout administrativo, auditoria privada e rate limiting foram validados com smoke focal usando sessões normais, isolamento individual A/B, regressão local e cleanup completo.

O estado final confirmado é `runtime=staging`, `allowed_environment=staging`, gate global OFF, limites padrão restaurados e zero fixtures sintéticas. O hardening 1B3.1 corrigiu a seleção de membership corrente após reingresso, sem alterar o SQL 06 aplicado. Security e Performance Advisors não reportaram P0/P1 novo; os WARN/INFO intencionais estão documentados em [`FASE_1B3_MEMBERSHIP_LIFECYCLE_E_CONTROLES_OPERACIONAIS.md`](FASE_1B3_MEMBERSHIP_LIFECYCLE_E_CONTROLES_OPERACIONAIS.md). Produção, Fase 1B4 e fases posteriores continuam fora do escopo.

Resultado: **FASE 1B3 APROVADA PARA REVISÃO**.

---

## 14.1. Fase 1B4/1B4.1 — contexto organizacional, shell clínico e hardening

A Fase 1B4 foi implementada na branch `feat/clinicas` com resolução server-side de contextos via JWT/RLS, store separado do estado de autenticação, seletor explícito “Minha conta / Clínica”, revalidação por sessão/foreground/troca de contexto e guardas de rota. O shell `/painel/clinica` é somente leitura e não acessa pacientes, evoluções, documentos ou métricas. O hardening 1B4.1 separa membership ativa de `clinical_access_enabled`: capacidade clínica informa autorização futura, mas não impede a entrada no contexto organizacional.

As flags permanecem independentes: `CLINIC_FEATURE_ENABLED` controla o backend e `VITE_CLINIC_FEATURE_ENABLED` controla a UX. O desligamento retorna ao fluxo individual; revogação de membership remove o contexto e cai para “Minha conta”. Produção, Fase 1B5, convites/UI de lifecycle, billing, seats, Stripe, pacientes compartilhados e Fase 2 continuam fora do escopo. O staging permanece com runtime `staging`, gate global OFF e sem fixtures sintéticas.

Resultado: **FASE 1B4 REVISADA E ENDURECIDA — APTO PARA FASE 1B5**.

---

## 14.2. Fase 1B5 — gestão segura da equipe e lifecycle

A Fase 1B5 foi implementada na branch `feat/clinicas` exclusivamente para o
staging `hwkdwinfckmjoriqxbjk`. O cliente server-side das rotas clínicas agora
usa a chave pública do próprio ambiente com o JWT do usuário, sem
`service_role` em caminhos user-scoped. Foi criado um diretório mínimo via RPC
controlada, sem ampliar a RLS individual de `professionals`, e fachadas para
suspensão, reativação, remoção, alteração de papel e transferência de owner.

A UI `/painel/clinica/equipe` é administrativa, respeita owner/manager/professional,
preserva histórico `removed`, revalida contexto após mutações e não cria convites,
seats, billing, dados clínicos compartilhados ou toggle de capacidade clínica.

O smoke staging confirmou isolamento cross-tenant, histórico, concorrência de
owner, revogação no mesmo token, cleanup zero e gate global OFF. Security e
Performance Advisors foram revisados sem P0/P1 novo; as ocorrências WARN/INFO
permanecem documentadas. Produção não foi alterada.

Resultado: **FASE 1B5 APROVADA PARA REVISÃO**.

---

## 14.3. Fase 2A — motor de licenças, entitlement e capacidade clínica

A Fase 2A separa definitivamente os entitlements individual e empresarial: a
clínica não cancela nem altera o plano individual, e membership empresarial
não concede recursos pessoais premium. O contrato empresarial é a fonte de
capacidade do workspace, com catálogo interno do Plano Clínica, snapshots
monetários em centavos e mínimo contratado de 3 seats.

`active_seats`, `reserved_seats` e `available_seats` são sempre derivados das
memberships e convites válidos. Owner/manager administrativo não consome seat
quando `clinical_access_enabled=false`; membership suspensa não consome seat;
convite clínico pending reserva seat; aceite converte a reserva em seat ativo.
Redução futura nunca poderá deixar o contrato abaixo de `max(3,
active+reserved)`. `past_due` possui grace de 7 dias; depois, o workspace fica
`restricted`, preservando leitura/administração básica e bloqueando expansão.
O catálogo representa a oferta comercial atual: `enabled=false` impede novas
vendas, mas não revoga contratos históricos, cujos valores são snapshots
contratuais independentes de alterações futuras no catálogo. O hardening também
mantém a separação entre contrato financeiro e estado operacional: `restricted`
não é promovido automaticamente a `full`, e a conversão de convite clínico usa
a reserva já existente sem consumir uma segunda vaga.

A implementação da Fase 2A permanece exclusivamente staging. A Fase 2B foi
executada também somente em staging, em Stripe Test Mode, com catálogo
idempotente, Checkout empresarial, webhook assinado, reconciliação server-side,
alteração de seats e cancelamento ao fim do período. O smoke foi limpo ao final:
não há organizações, subscriptions ou dados sintéticos remanescentes e o gate
global voltou a OFF. Não houve Stripe Live, cobrança real, produção, convites
reais ou pacientes/evoluções organizacionais. Ver os relatórios da [Fase 2A](FASE_2A_MOTOR_LICENCAS_ENTITLEMENT.md) e da [Fase 2B](FASE_2B_STRIPE_TEST_BILLING_CLINICA.md).

---

## 15. Resultado esperado

Atualização 2026-09-16 — Fase 2C: emissão server-side, ledger privado sem
conteúdo sensível, landing isolada, handoff HttpOnly de 45 min, aceite autenticado,
rotação/revogação e UI Equipe implementados em `feat/clinicas`. Migration 21
e smoke técnico mock-transport no staging PASS, com concorrência PostgreSQL
real e cleanup zero. Envio externo não realizado: faltam provider staging
com tracking/reescrita OFF e Auth Google staging (`external_google_enabled=false`).
Estado: **FASE 2C BLOQUEADA** para smoke externo; gates global/entrega/billing
OFF, produção/Stripe/pacientes intactos. Ver [relatório Fase 2C](FASE_2C_CONVITES_REAIS.md).
Atualização 2026-09-17 — Fase 3: pacientes compartilhados implementados e
validados no staging `hwkdwinfckmjoriqxbjk`. A entrega inclui
`organization_patients`, atribuições Primary/Secondary/Consultor, RPCs
server-side, isolamento dos pacientes pessoais, correção ACL do helper RLS e
UI dedicada, sem alterar `evolutions`. O smoke sintético passou com isolamento
cross-tenant, Secondary/Consultor somente leitura e regressão pessoal; a
fixture foi limpa, o gate terminou OFF e profissionais controlados preexistentes
foram preservados. A evolução desse baseline para a Fase 4 está registrada abaixo.

Atualização 2026-09-17 — Fase 4: evoluções clínicas com contexto completo e
imutável, criação protegida derivando autoria de auth.uid(), RLS por autor,
Primary/Secondary/Consultor autorizados independentemente no mesmo paciente
e UI dedicada reutilizando NewEvolution. O smoke completo final confirmou
isolamento cross-author/cross-tenant, deny administrativo/unassigned,
assinatura/hash, restricted somente leitura e preservação do contexto pessoal
(histórico, reports, endpoints semânticos e backup). A fixture final foi limpa
com zero resíduos, gate global OFF e profissionais controlados preservados.
Security/Performance Advisors sem novo P0/P1 ou WARN. Google Docs clínico,
busca semântica clínica, reports/PDI compartilhados e backup empresarial não
foram habilitados. Produção e main não foram alteradas; Fase 5 não iniciada.
Os limites de evidência e as tentativas interrompidas por fixture estão em
[FASE_4_EVOLUCOES_ISOLADAS.md](FASE_4_EVOLUCOES_ISOLADAS.md).

Atualização 2026-09-18 — Fase 5: ecossistema empresarial implementado na
branch `feat/clinicas` e isolado no staging. O dashboard passou a mostrar
somente indicadores operacionais conforme o papel; a auditoria usa o ledger
privado imutável com cursor e filtro; arquivamento/reativação foram separados
do PATCH cadastral; e a troca de Primary é transacional, auditada e preserva
as evoluções existentes. A validação final, advisors e cleanup estão registrados
no relatório [FASE 5](FASE_5_ECOSSISTEMA_EMPRESARIAL.md). Produção, `main`,
providers externos e Fase 6 permanecem fora do escopo.

Ao final do roadmap, a Evolução Clínica terá dois modelos coexistindo com segurança:

- **modelo individual:** o profissional mantém seus pacientes e evoluções no contexto pessoal atual;
- **modelo empresarial:** a clínica controla equipe, licenças e pacientes compartilhados, enquanto cada profissional mantém autoria e privacidade das próprias evoluções.

A conexão entre os dois modelos será feita por organização, associação e permissão — nunca pela duplicação de pacientes ou pela abertura indiscriminada do prontuário clínico.
