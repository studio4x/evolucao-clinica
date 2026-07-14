# Roadmap Empresarial — Clínicas, Licenças, Equipes e Pacientes Compartilhados

**Status:** Planejado — não implementado  
**Tipo:** Especificação funcional, de dados, segurança e implantação  
**Escopo:** Plano empresarial para clínicas + colaboração profissional em pacientes  
**Documento de decisão:** Este arquivo deve ser tratado como referência antes de qualquer migration, tela, endpoint ou alteração de política RLS.

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

Uma organização não deve ser confundida com uma conta de usuário. Ela pode ter vários usuários e um usuário pode, no futuro, participar de mais de uma organização, desde que o contexto ativo seja explícito.

### 4.2 Regra de usuário `empresarial`

O papel global `empresarial` será reservado ao usuário responsável por administrar a clínica dentro da plataforma. Ele poderá:

- configurar a organização;
- visualizar o contrato e a ocupação de licenças;
- convidar, ativar, suspender e remover profissionais;
- criar e distribuir pacientes entre profissionais;
- consultar indicadores operacionais;
- abrir solicitações de suporte em nome da clínica.

O papel `empresarial` não deve ser aplicado automaticamente a todos os profissionais da clínica. Os profissionais continuam sendo usuários clínicos, normalmente com papel `therapist`, e recebem permissões empresariais por meio da associação à organização.

### 4.3 Membro da organização

É a relação entre um usuário e uma clínica. A associação deve possuir papel próprio, independente do papel global do usuário:

- `owner`: responsável contratual e administrativo principal;
- `manager`: gestor empresarial autorizado pela clínica;
- `clinical_supervisor`: papel futuro, com acesso clínico ampliado e consentimento explícito;
- `professional`: profissional que consome uma licença e atende pacientes;
- `assistant`: função futura, sem acesso ao conteúdo clínico por padrão.

No primeiro MVP, `owner`, `manager` e `professional` são suficientes. `clinical_supervisor` e `assistant` podem ser modelados desde o início, mas liberados somente quando as políticas de acesso estiverem validadas.

### 4.4 Licença

Licença é a capacidade contratada para um usuário profissional. A conta empresarial pode existir sem consumir uma licença profissional, conforme a regra comercial definida no contrato. A política recomendada é:

- `owner` e `manager`: não consomem licença clínica;
- `professional`: consome uma licença;
- `assistant`: não consome licença clínica no MVP, mas pode ter limite próprio no futuro;
- convite pendente: reserva uma licença para impedir excesso de contratação durante o período de convite.

Essa regra deve ser configurável no produto, mas nunca calculada apenas pela interface.

### 4.5 Paciente da clínica

É o cadastro clínico pertencente ao espaço da organização. Ele deve existir uma única vez dentro da clínica e ser associado a vários profissionais por uma tabela de atribuição.

Não haverá uma cópia do paciente por profissional. Nome, data de nascimento, contatos e dados cadastrais compartilháveis permanecem no cadastro comum; evoluções e anotações profissionais permanecem isoladas.

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
- `status`: `active`, `suspended`, `canceled`, `pending_setup`;
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
- `status`: `invited`, `active`, `suspended`, `removed`;
- `seat_required`;
- `invited_by`;
- `joined_at`, `suspended_at`, `removed_at`;
- `created_at`, `updated_at`.

Restrições:

- uma única associação ativa do mesmo usuário para a mesma organização;
- pelo menos um `owner` ativo por organização;
- não permitir remoção do último `owner` sem transferência de propriedade;
- o estado da associação é a fonte de verdade para acesso empresarial.

### 5.3 `organization_invitations`

Controla o convite de novos usuários.

Campos principais:

- `id`;
- `organization_id`;
- `email` normalizado;
- `membership_role`;
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
- `contracted_seats`;
- `reserved_seats`;
- `active_seats`;
- `stripe_customer_id`;
- `stripe_subscription_id`;
- identificadores dos itens recorrentes base e licença;
- `status`: `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `grace_period`;
- `current_period_start`, `current_period_end`;
- `canceled_at`;
- `created_at`, `updated_at`.

O snapshot de preço é necessário para preservar o contrato histórico quando o preço público do plano mudar.

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

No MVP, `can_create_evolution` pode ser verdadeiro para profissionais ativos e `can_view_shared_summary` falso até existir uma especificação de resumos compartilhados. O modelo deve evitar presumir que qualquer resumo é seguro para todos.

### 5.7 Evoluções e artefatos clínicos

As tabelas existentes de evoluções, relatórios, rascunhos e assinaturas devem continuar preservando:

- `professional_id` como autor;
- `patient_id` como paciente;
- data, status e assinatura do registro.

Para o contexto empresarial, recomenda-se adicionar uma referência explícita ao vínculo da organização, como `organization_id` ou `organization_patient_id`, quando isso não quebrar o histórico legado. Essa referência deve ser gravada no momento da criação e não deve ser alterada silenciosamente depois.

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

---

## 6. Plano empresarial e regra de cobrança

### 6.1 Produto comercial

Adicionar um produto de plano empresarial, preferencialmente com identificador estável como `enterprise` ou `clinic`, sem reutilizar `monthly` e `yearly` individuais.

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

### 6.2 Fórmula inicial

```text
total do período = preço base do período + (licenças contratadas × preço por licença)
```

O contrato deve informar claramente:

- se o usuário `empresarial` é ou não uma licença;
- se convites pendentes reservam licença;
- se a redução de licenças só vale no próximo ciclo;
- como funciona o excedente;
- qual é a política durante inadimplência e período de tolerância.

### 6.3 Sincronização com cobrança

O Stripe deve ser a origem do evento financeiro, enquanto o banco da aplicação mantém o estado operacional necessário para autorização.

Fluxo recomendado:

1. criar o cliente empresarial;
2. criar a assinatura com dois itens recorrentes: base e licenças;
3. persistir os IDs retornados;
4. ajustar a quantidade do item de licenças quando a clínica comprar ou liberar lugares;
5. processar webhooks idempotentes;
6. atualizar o status empresarial apenas após confirmação do evento;
7. registrar histórico de alterações de assento e preço.

Nenhuma tela deve liberar licenças apenas porque o pagamento foi iniciado no navegador.

---

## 7. Fluxos funcionais

### 7.1 Contratação e criação da clínica

1. O comprador escolhe o plano empresarial e a quantidade de licenças.
2. O checkout coleta dados da organização e do responsável.
3. Após confirmação, cria-se a organização e a associação `owner`.
4. O usuário responsável recebe o papel global `empresarial`.
5. A assinatura e os assentos são gravados com status confirmado.
6. O usuário é direcionado ao onboarding empresarial.
7. A aplicação mostra um checklist: dados da clínica, equipe, licenças e pacientes.

### 7.2 Convite de profissional

1. O gestor acessa a equipe.
2. O sistema mostra licenças contratadas, reservadas e disponíveis.
3. O gestor informa nome, e-mail e função.
4. O backend valida a licença e cria um convite de uso único.
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

### 7.4 Criação da evolução

1. O profissional abre um paciente ao qual está atribuído.
2. O backend valida organização, associação ativa e permissão de criação.
3. A evolução é criada com o `professional_id` autenticado, nunca com um ID recebido livremente do frontend.
4. O histórico fica visível ao autor conforme as regras atuais.
5. Outro profissional do mesmo paciente não recebe acesso ao conteúdo por causa do compartilhamento.
6. Assinatura digital, hash, nome e registro profissional permanecem ligados ao autor.

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
- redução: impedir quantidade inferior ao número de licenças ativas;
- redução com excesso: solicitar desativação ou transferência antes de confirmar;
- convite pendente: liberar ou cancelar a reserva explicitamente;
- alteração financeira: registrar quem solicitou, quando e qual foi o novo valor.

---

## 8. Permissões e privacidade

### Matriz inicial

| Ação | Empresarial | Profissional atribuído | Profissional não atribuído | Admin da plataforma |
|---|---:|---:|---:|---:|
| Gerenciar dados da clínica | Sim | Não | Não | Suporte auditado |
| Convidar profissionais | Sim | Não | Não | Sim |
| Ver ocupação de licenças | Sim | Não | Não | Sim |
| Ver cadastro básico do paciente | Conforme vínculo da clínica | Sim | Não | Suporte auditado |
| Criar evolução | Não por padrão | Sim | Não | Não por padrão |
| Ler evolução de outro profissional | Não por padrão | Não por padrão | Não | Não por padrão |
| Ler suas próprias evoluções | Não por padrão | Sim | Não | Não por padrão |
| Atribuir paciente | Sim | Conforme permissão | Não | Sim |
| Remover paciente da clínica | Sim, com confirmação | Não por padrão | Não | Sim |
| Ver auditoria empresarial | Sim, sem conteúdo clínico | Não | Não | Sim |

O papel `empresarial` deve administrar a operação, não receber acesso irrestrito ao prontuário clínico. Qualquer exceção de leitura clínica precisa ser uma permissão separada, com finalidade, consentimento e auditoria.

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
- separar leitura do cadastro do paciente da leitura da evolução;
- impedir que uma política ampla de organização conceda leitura das evoluções;
- usar RPCs `SECURITY DEFINER` somente com `search_path` controlado e validação de permissão;
- registrar alterações de membros, licenças, atribuições e exportações.

---

## 9. Ecossistema de telas

O dashboard empresarial previsto no `DASHBOARD_SPEC.md` deve ser concretizado em uma navegação própria, sem misturar todos os controles com o painel global de administrador.

### Área empresarial

- **Visão geral:** licenças, equipe ativa, convites, pacientes e pendências;
- **Minha clínica:** dados cadastrais, contatos e configurações;
- **Equipe:** listagem, convite, função, status, última atividade e ações;
- **Licenças e assinatura:** plano, fórmula, consumo, histórico, alteração de quantidade e cobrança;
- **Pacientes:** diretório da clínica, filtros, profissionais vinculados e status;
- **Atribuições:** distribuição e redistribuição de pacientes;
- **Auditoria:** eventos administrativos sem exibir conteúdo clínico;
- **Suporte:** chamados vinculados ao contexto empresarial.

### Área do profissional

- seletor visual de contexto pessoal/clínica, quando o usuário tiver mais de um contexto;
- lista de pacientes próprios e pacientes da clínica aos quais está atribuído;
- badge informando se o paciente é pessoal, primário ou compartilhado;
- histórico de evoluções filtrado pelo profissional autenticado;
- nenhuma mudança silenciosa no fluxo individual atual.

### Estados que precisam de UX explícita

- sem licenças disponíveis;
- convite expirado;
- organização suspensa ou em período de tolerância;
- profissional removido com pacientes ainda atribuídos;
- paciente sem profissional primário;
- tentativa de abrir evolução de outro profissional;
- usuário pertencente a mais de uma clínica;
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
- aviso de privacidade específico para clínicas;
- exportação e exclusão conforme retenção legal;
- bloqueio de acesso após remoção de membro;
- proteção contra enumeração de e-mails e tokens de convite;
- rate limit para convites e tentativas de aceite;
- mascaramento de dados sensíveis em telas administrativas;
- revisão de todos os jobs, notificações e backups para respeitar o contexto empresarial.

---

## 11. Plano de implementação futuro

### Fase 0 — Decisões de produto e contrato

- confirmar nomenclatura `empresarial`, `clínica`, `profissional` e `licença`;
- decidir se owner/manager consomem licença;
- definir preços, mínimo de licenças, periodicidade e tolerância;
- definir se o gestor poderá ver apenas indicadores ou também conteúdo clínico;
- aprovar a política de paciente único por clínica;
- aprovar textos de consentimento e privacidade.

**Gate:** nenhuma migration antes dessas decisões.

### Fase 1 — Fundação de organização e identidade

- criar `organizations`, `organization_memberships` e `organization_invitations`;
- ampliar o modelo de papéis com `empresarial` sem quebrar `admin` e `therapist`;
- criar funções de autorização e RLS;
- construir onboarding mínimo da clínica;
- validar convite, aceite, suspensão e transferência de owner.

### Fase 2 — Assinatura empresarial e licenças

- adicionar o plano `enterprise`/`clinic`;
- criar `organization_subscriptions`;
- implementar cobrança base + item de licença;
- integrar webhooks idempotentes;
- bloquear convites e ativações sem licença;
- criar telas de quantidade, consumo e histórico.

### Fase 3 — Pacientes compartilhados

- criar `organization_patients`;
- criar `patient_professional_assignments`;
- revisar queries atuais que filtram somente por `professional_id`;
- adaptar cadastro, lista, dashboard e detalhe do paciente;
- garantir que a mesma pessoa não seja duplicada para cada profissional.

### Fase 4 — Evoluções isoladas

- revisar RLS de evoluções, relatórios, rascunhos e buscas;
- manter autoria profissional obrigatória;
- testar criação simultânea por dois profissionais;
- impedir leitura cruzada por padrão;
- revisar assinaturas, hashes, exportações e notificações.

### Fase 5 — Ecossistema empresarial

- consolidar dashboard empresarial;
- implementar auditoria;
- implementar gestão de pacientes e reatribuição;
- adicionar indicadores operacionais;
- preparar papéis futuros de supervisor e assistente;
- documentar suporte e recuperação de conta.

### Fase 6 — Homologação e lançamento controlado

- executar testes de segurança com dois profissionais e duas clínicas;
- migrar um grupo interno piloto;
- validar cobrança real e falhas de webhook;
- testar cancelamento, downgrade e remoção de usuário;
- confirmar que nenhum dado clínico cruza a fronteira indevida;
- liberar por feature flag ou organização piloto;
- só depois expandir comercialmente.

---

## 12. Critérios de aceite

### Assinatura e licenças

- O preço total exibe base, unidade e quantidade de licenças.
- O checkout cria e mantém a assinatura empresarial correta.
- Não é possível ativar mais profissionais do que as licenças contratadas.
- Webhooks repetidos não duplicam assentos ou transações.
- Cancelamento e inadimplência têm comportamento documentado e testado.

### Usuários

- O usuário `empresarial` consegue administrar a clínica sem acessar conteúdo clínico por padrão.
- Convites são únicos, expiram e podem ser revogados.
- A remoção de um membro invalida seus novos acessos imediatamente.
- O último owner não pode ser removido sem transferência.

### Pacientes e evoluções

- Um paciente aparece uma única vez no diretório da clínica.
- O mesmo paciente pode ter vários profissionais ativos.
- Dois profissionais conseguem criar evoluções independentes para o mesmo paciente.
- Cada profissional vê suas próprias evoluções.
- Um profissional não vê a evolução de outro sem permissão explícita.
- A revogação de um vínculo não apaga histórico nem altera autoria.

### Segurança

- Consultas sem organização ou associação válida retornam vazio/negado.
- Alterar IDs no frontend não permite acessar dados de outro contexto.
- Todas as ações administrativas relevantes aparecem na auditoria.
- Exportações e relatórios respeitam o mesmo escopo das evoluções.

---

## 13. Perguntas que precisam de decisão antes da implementação

1. A licença inclui apenas profissionais clínicos ou também gestores?
2. O número mínimo de licenças será um ou mais?
3. O preço por licença é igual para todas as funções?
4. O gestor empresarial poderá ver evoluções em situações de supervisão?
5. Se puder, quais campos e qual processo de autorização serão exigidos?
6. Uma clínica poderá ter mais de um owner?
7. Um profissional poderá participar de várias clínicas usando a mesma conta?
8. O paciente poderá pertencer a mais de uma clínica no futuro?
9. Como será registrado o consentimento do paciente para compartilhamento interno?
10. O paciente terá um profissional primário obrigatório?
11. A clínica poderá reatribuir pacientes durante férias ou desligamentos?
12. Qual será a política de retenção após cancelamento da assinatura?
13. Haverá período de tolerância antes de bloquear acesso clínico?
14. A cobrança será feita apenas pelo Stripe ou haverá faturamento manual empresarial?

---

## 14. Resultado esperado

Ao final do roadmap, a Evolução Clínica terá dois modelos coexistindo com segurança:

- **modelo individual:** o profissional mantém seus pacientes e evoluções no contexto pessoal atual;
- **modelo empresarial:** a clínica controla equipe, licenças e pacientes compartilhados, enquanto cada profissional mantém autoria e privacidade das próprias evoluções.

A conexão entre os dois modelos será feita por organização, associação e permissão — nunca pela duplicação de pacientes ou pela abertura indiscriminada do prontuário clínico.
