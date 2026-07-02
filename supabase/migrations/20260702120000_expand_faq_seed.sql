WITH new_questions AS (
    SELECT *
    FROM (
        VALUES
            (
                'Primeiros Passos',
                'Qual é o fluxo mais rápido para começar a usar o app no dia a dia?',
                'O caminho ideal é: 1) cadastrar o paciente, 2) criar ou vincular o prontuário no Google Docs, 3) gravar ou enviar o áudio da sessão, 4) revisar o resultado se desejar e 5) deixar a evolução salva no prontuário. Depois que esse fluxo inicial está pronto, os próximos atendimentos ficam muito mais rápidos.',
                3
            ),
            (
                'Primeiros Passos',
                'Posso enviar mais de um áudio na mesma evolução clínica?',
                'Sim. Você pode gravar em partes ou anexar vários arquivos de áudio no mesmo atendimento. O sistema processa os áudios na ordem em que foram organizados e junta as transcrições no mesmo registro clínico.',
                4
            ),
            (
                'Primeiros Passos',
                'O que acontece se eu interromper a gravação ou fechar a tela sem concluir?',
                'O app mantém rascunhos locais das gravações em andamento. Quando você voltar para a evolução do mesmo paciente, poderá recuperar o material para enviar, continuar gravando ou descartar e começar de novo.',
                5
            ),
            (
                'Primeiros Passos',
                'Preciso digitar tudo manualmente depois que a IA terminar?',
                'Não necessariamente. A proposta do app é reduzir a digitação ao mínimo. Após o processamento, você ainda pode abrir o documento, revisar o texto e fazer ajustes finos manualmente no Google Docs ou pelo editor exibido dentro da plataforma.',
                6
            ),
            (
                'Inteligência Artificial',
                'Posso escolher um modelo de estrutura para a evolução clínica?',
                'Sim. O sistema pode trabalhar com templates clínicos configurados, como modelos mais narrativos ou estruturas específicas da sua especialidade. Se um template padrão estiver vinculado ao paciente, ele já aparece selecionado ao iniciar uma nova evolução.',
                3
            ),
            (
                'Inteligência Artificial',
                'A IA inventa informações que não estão no áudio?',
                'Não é esse o objetivo do sistema. A IA foi orientada para preservar o sentido clínico do que foi dito, corrigir vícios de fala, remover repetições desnecessárias e organizar o texto. Quanto mais claro e completo for o relato, melhor será o resultado final.',
                4
            ),
            (
                'Inteligência Artificial',
                'Como melhorar a qualidade da transcrição dos áudios?',
                'Fale em ambiente com menos ruído, identifique dados importantes com clareza, evite sobreposição de vozes e, se necessário, grave em blocos curtos. Também ajuda mencionar condutas, respostas do paciente e observações objetivas de forma direta.',
                5
            ),
            (
                'Inteligência Artificial',
                'A Pesquisa Inteligente consulta apenas uma evolução ou todo o histórico do paciente?',
                'Ela foi pensada para vasculhar o histórico clínico já registrado do paciente e responder perguntas em linguagem natural com base nas evoluções disponíveis. Isso permite localizar progressos, datas e informações recorrentes sem leitura manual de todo o prontuário.',
                6
            ),
            (
                'Google Docs & Sincronização',
                'Posso vincular um documento já existente do Google Docs em vez de criar um novo?',
                'Sim. No cadastro ou na edição do paciente, você pode vincular um documento do Google Docs já existente ou pedir para o sistema criar um novo prontuário organizado automaticamente na sua conta Google.',
                3
            ),
            (
                'Google Docs & Sincronização',
                'O que acontece se eu ficar sem internet durante o envio do áudio?',
                'Quando possível, o app salva a evolução na Fila Offline do dispositivo. Assim que a conexão voltar, você poderá retomar a sincronização sem precisar refazer toda a gravação do zero.',
                4
            ),
            (
                'Google Docs & Sincronização',
                'Posso abrir e editar o prontuário manualmente depois da sincronização?',
                'Sim. O prontuário continua sendo seu no Google Docs. Você pode abri-lo diretamente no Google Drive, revisar o texto, complementar informações e fazer ajustes quando precisar.',
                5
            ),
            (
                'Google Docs & Sincronização',
                'O que significa quando o sistema pede para renovar a autenticação do Google?',
                'Isso normalmente indica que a sessão do Google expirou ou que ainda faltam permissões clínicas completas para Drive e Docs. Ao renovar a autenticação, o app volta a conseguir ler e atualizar os prontuários vinculados.',
                6
            ),
            (
                'Google Docs & Sincronização',
                'Consigo compartilhar um áudio do WhatsApp direto para o app?',
                'Sim. O aplicativo aceita o fluxo de compartilhamento de áudio do WhatsApp no celular. Depois de compartilhar, basta escolher o paciente e concluir o processamento para transformar a mensagem de voz em evolução clínica.',
                7
            ),
            (
                'Assinatura Digital & Segurança',
                'Qual é a diferença entre um documento em rascunho e um documento assinado?',
                'Enquanto está em rascunho, o conteúdo pode ser revisado e ajustado. Depois da assinatura digital e do fechamento, o documento passa a ser tratado como registro final, com proteção contra alterações para fins de conformidade e rastreabilidade.',
                3
            ),
            (
                'Assinatura Digital & Segurança',
                'Posso enviar relatórios por WhatsApp ou e-mail pela plataforma?',
                'Sim, mas os relatórios precisam estar devidamente fechados e assinados digitalmente antes do envio. Isso reduz riscos de compartilhar versões incompletas e reforça a segurança documental do processo.',
                4
            ),
            (
                'Assinatura Digital & Segurança',
                'Quem é responsável pelo consentimento do paciente para gravação e compartilhamento?',
                'O profissional responsável pelo atendimento deve obter e registrar os consentimentos éticos e legais aplicáveis ao seu contexto clínico. A plataforma oferece recursos de organização e segurança, mas o uso adequado dos dados sensíveis continua exigindo responsabilidade profissional e conformidade com a LGPD.',
                5
            ),
            (
                'Planos & Assinaturas',
                'Existe período de teste antes de contratar um plano?',
                'Sim. Ao criar a conta, o usuário recebe um período de teste gratuito de 7 dias com acesso à experiência principal da plataforma, para validar o fluxo antes de contratar um plano pago.',
                2
            ),
            (
                'Planos & Assinaturas',
                'Quais recursos dependem de uma assinatura ativa?',
                'Os recursos centrais de produtividade, como transcrição por IA, integração em tempo real com Google Docs e outras automações clínicas do app, dependem de um plano ativo. Sem assinatura válida, o acesso a essas funções pode ser bloqueado.',
                3
            ),
            (
                'Planos & Assinaturas',
                'Tenho direito a reembolso se desistir após assinar?',
                'Sim. A plataforma informa política de reembolso dentro do prazo legal de 7 dias a partir da assinatura, conforme as condições exibidas na área de assinatura. Após esse período, o cancelamento pode encerrar a renovação, mas não gera estorno automático.',
                4
            ),
            (
                'Planos & Assinaturas',
                'Posso trocar de plano ou cancelar sem falar com o suporte?',
                'Sim. O gerenciamento da assinatura foi pensado para ser feito pelo próprio painel do usuário, permitindo alterar, cancelar ou acompanhar o status do plano sem burocracia desnecessária.',
                5
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
