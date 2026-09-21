-- Adiciona perguntas sobre as funcionalidades recentes do controle clínico.
-- A verificação por categoria e pergunta torna a migração segura para reexecução.
WITH new_questions AS (
    SELECT *
    FROM (
        VALUES
            (
                'Primeiros Passos',
                'O que é o Controle de Sessões?',
                'O Controle de Sessões organiza os atendimentos de cada paciente por mês. Nele você pode registrar data, horário, status, observações e pacote de sessões, acompanhar o que está pendente e coletar a assinatura do atendimento diretamente no dispositivo.',
                10
            ),
            (
                'Primeiros Passos',
                'Como vinculo uma sessão a uma evolução clínica?',
                'Abra o Controle de Sessões no cadastro do paciente. Se já existir uma evolução para a mesma data e horário, ela poderá ser vinculada ao atendimento; caso contrário, use “Criar evolução” para registrar o conteúdo e vinculá-lo à sessão. Uma evolução já vinculada pode ser aberta pelo próprio controle.',
                11
            ),
            (
                'Primeiros Passos',
                'Posso corrigir a data ou o horário de uma sessão?',
                'Sim. Enquanto a sessão não estiver assinada e o mês não estiver fechado, você pode editar a data, o horário, o status, as observações e o vínculo com a evolução. Depois da assinatura, é necessário revogá-la antes de alterar os dados essenciais.',
                12
            ),
            (
                'Primeiros Passos',
                'Como funciona a agenda recorrente de sessões?',
                'No cadastro do paciente, informe os dias da semana e os horários habituais. O Controle de Sessões usa essa agenda para sugerir os próximos atendimentos; você também pode configurar o prazo do lembrete de evolução após o horário previsto da sessão.',
                13
            ),
            (
                'Primeiros Passos',
                'O que acontece quando fecho e assino o mês de sessões?',
                'O fechamento registra um retrato do mês, incluindo as sessões e assinaturas, e protege o período contra novas alterações. Se precisar corrigir algo, a assinatura correspondente deve ser revogada conforme as regras do controle antes de fazer a correção.',
                14
            ),
            (
                'Primeiros Passos',
                'Posso organizar atendimentos em um pacote de sessões?',
                'Sim. Crie um pacote com uma identificação e a quantidade prevista de sessões. Ao registrar os atendimentos, associe cada sessão ao pacote para acompanhar quantas já foram concluídas; um pacote ativo também pode ser cancelado quando necessário.',
                15
            ),
            (
                'Primeiros Passos',
                'O CPF do paciente é obrigatório?',
                'Não. O CPF é um campo opcional do cadastro. Quando informado, ele é salvo no cadastro clínico do paciente; o atendimento pode ser registrado mesmo sem esse dado.',
                16
            ),
            (
                'Inteligência Artificial',
                'Posso criar uma evolução diretamente no Controle de Sessões?',
                'Sim. Em uma sessão sem evolução vinculada, o Controle de Sessões permite escrever o conteúdo, escolher um modelo clínico quando disponível e salvar a nova evolução já associada à data e ao horário do atendimento.',
                10
            ),
            (
                'Google Docs & Sincronização',
                'O Controle de Sessões substitui o prontuário no Google Docs?',
                'Não. Ele organiza os atendimentos e seus vínculos no painel. O prontuário continua sendo mantido no Google Docs, e a evolução criada ou processada segue o fluxo de sincronização configurado para o paciente.',
                10
            ),
            (
                'Assinatura Digital & Segurança',
                'Como funciona a assinatura de presença de uma sessão?',
                'Na sessão concluída, use a opção de assinatura para coletar o registro do paciente ou do responsável. A assinatura fica vinculada ao atendimento e mantém histórico de auditoria; uma sessão assinada não deve ser alterada sem a revogação registrada.',
                10
            ),
            (
                'Assinatura Digital & Segurança',
                'O que é a Anamnese do paciente?',
                'É um registro estruturado para reunir informações iniciais e dados relevantes do acompanhamento. Você pode preencher os campos do modelo, salvar como rascunho, concluir o registro e consultar as versões anteriores do paciente.',
                11
            ),
            (
                'Assinatura Digital & Segurança',
                'Posso iniciar uma nova anamnese sem perder a anterior?',
                'Sim. Ao iniciar uma nova anamnese, a versão anterior permanece no histórico. Você pode começar do zero ou copiar a última anamnese, mantendo o registro das versões para consulta e auditoria.',
                12
            ),
            (
                'Assinatura Digital & Segurança',
                'É possível reabrir uma anamnese concluída?',
                'Sim. A anamnese concluída fica protegida para preservar o registro. Se precisar corrigir informações, use a opção de reabertura; ela devolve o registro ao estado de rascunho e registra o evento no histórico.',
                13
            ),
            (
                'Assinatura Digital & Segurança',
                'Posso baixar a anamnese em PDF?',
                'Sim. A anamnese pode ser exportada em PDF a partir do registro atual ou de versões anteriores, quando o recurso estiver disponível para o seu plano. O arquivo pode incorporar o logotipo configurado no perfil profissional.',
                14
            ),
            (
                'Planos & Assinaturas',
                'Quem pode usar a Anamnese e os Arquivos do paciente?',
                'A geração estruturada de anamnese, seu histórico e PDF, assim como a inserção de arquivos do paciente, são recursos do Plano Anual ativo. O painel identifica essa condição e direciona para a assinatura quando o plano não estiver elegível.',
                10
            ),
            (
                'Google Docs & Sincronização',
                'Onde ficam armazenados os arquivos anexados ao paciente?',
                'Os arquivos são salvos na pasta do Google Drive vinculada ao paciente. Para adicionar arquivos, é necessário ter uma pasta vinculada e uma conexão Google válida com as permissões clínicas necessárias.',
                11
            ),
            (
                'Google Docs & Sincronização',
                'Quais tipos de arquivo posso anexar ao paciente?',
                'O recurso aceita documentos, imagens, planilhas, textos, áudios e vídeos nos formatos compatíveis exibidos no seletor de arquivos. Arquivos comuns têm limite de 25 MB; vídeos podem ter até 250 MB.',
                12
            )
    ) AS t(category_name, question, answer, display_order)
)
INSERT INTO public.faq_questions (category_id, question, answer, display_order)
SELECT
    c.id,
    nq.question,
    nq.answer,
    nq.display_order
FROM new_questions nq
JOIN public.faq_categories c
    ON c.name = nq.category_name
WHERE NOT EXISTS (
    SELECT 1
    FROM public.faq_questions fq
    WHERE fq.category_id = c.id
      AND fq.question = nq.question
);
