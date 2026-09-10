# Plano de melhorias de ativação e conversão

Atualizado em 10 de setembro de 2026.

## Objetivo

Fazer o profissional chegar ao primeiro valor real da plataforma antes de consumir o período de avaliação e medir, sem dados clínicos ou PII, em qual etapa cada coorte deixa de avançar.

## Implementação entregue

- O novo usuário tem uma janela inicial de 72 horas para concluir a primeira evolução real.
- Os sete dias completos de avaliação começam somente quando a evolução estiver processada e adicionada ao prontuário do Google Docs.
- Falhas de permissão Google preservam o formulário e abrem diretamente a reconexão necessária.
- O banner de avaliação e o CTA de assinatura permanecem visíveis também no celular.
- A sequência educativa deixa de avançar depois do encerramento do trial.
- A mensagem condicional de retomada aponta para a próxima ação concreta e permanece em `draft`, sem envio automático.
- O checkout registra início, abertura do provedor, pendência, pagamento, cancelamento e falha, sem armazenar cartão, conteúdo clínico, e-mail ou telefone.
- O admin exibe o funil dos últimos 30 dias, a primeira evolução em até 48 horas, retorno em outro dia, erros de escopo Google e estados do checkout.
- A primeira escolha do onboarding é preservada de forma imutável e exibida no profissional separadamente do modo atual.
- O admin possui um quadro visual em formato kanban que posiciona cada profissional somente na etapa mais avançada comprovada, com busca, filtros comerciais e acesso aos detalhes individuais.
- Cada cartão do kanban oferece uma mensagem contextual: o WhatsApp abre a conversa externa com o texto pronto quando há número cadastrado; o e-mail abre uma prévia completa e exige confirmação manual antes do envio pelo provedor configurado.
- Usuários com trial encerrado podem responder ao formulário autenticado de continuidade.

## Definições de medição

| Indicador | Definição |
| --- | --- |
| Cadastro | Profissional criado na coorte, excluindo administradores e cortesia |
| Primeiro paciente | Ao menos um paciente persistido |
| Prontuário vinculado | Ao menos um paciente com documento Google vinculado |
| Primeira evolução | Transcrição concluída e inclusão no Google Docs concluída |
| Primeira evolução em 48h | Primeira evolução real concluída em até 48 horas do cadastro |
| Retorno | Atividade real de produto em pelo menos dois dias distintos |
| Conversão paga | Plano pago com assinatura ativa entre usuários cujo trial já amadureceu ou que já pagaram |
| Caminho inicial | Primeira escolha explícita entre configurar com ajuda e conhecer o aplicativo primeiro |
| Posição no kanban | Etapa mais avançada comprovada entre cadastro, WhatsApp, escolha inicial, paciente, prontuário, evolução, retorno e plano pago |

Abertura de e-mail, entrega de mensagem e atualização automática de perfil não contam como uso do produto.

## Acompanhamento por 30 dias

1. Nos primeiros 3 dias, validar novos cadastros, ativação do trial e estados do checkout diariamente.
2. Na primeira semana, revisar as principais quedas entre cadastro, WhatsApp, paciente, prontuário e primeira evolução.
3. Na segunda semana, comparar a taxa de primeira evolução em 48 horas e os erros de permissão Google com a linha de base da auditoria.
4. Na terceira semana, revisar feedbacks de continuidade e classificar as barreiras por produto, integração, preço ou contexto profissional.
5. Ao completar 30 dias, comparar conversão paga apenas em coortes maduras e decidir quais mensagens em `draft` merecem teste controlado.

## Guardrails operacionais

- Não ativar mensagens de lifecycle em massa sem revisão editorial e teste de audiência.
- Não considerar redirecionamento para a página de sucesso como pagamento confirmado; a confirmação continua dependente do webhook e do estado persistido.
- Não registrar conteúdo clínico, dados de cartão ou identificadores pessoais no funil.
- Não alterar retrospectivamente a duração de trials antigos; a nova regra vale para acessos provisionados após a publicação do backend.
- Executar uma compra real controlada somente com autorização financeira explícita e depois estorná-la pelo fluxo operacional aprovado.

## Pendência de segurança externa

Os scripts locais versionados em `scratch/` foram removidos e o diretório passou a ser ignorado. Como uma credencial de banco apareceu no histórico Git anterior, a senha do banco de produção deve ser rotacionada no Supabase e qualquer integração que use conexão direta deve receber a nova credencial. A rotação não deve ser feita às cegas, pois pode interromper consumidores externos não mapeados.
