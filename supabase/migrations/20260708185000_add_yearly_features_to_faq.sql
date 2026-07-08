-- Adiciona perguntas relacionadas ao Plano Anual no FAQ do sistema
INSERT INTO public.faq_questions (category_id, question, answer, display_order) VALUES
(
  'b1100000-0000-0000-0000-000000000003',
  'Como funciona o Backup e Restauração automática de dados no Google Drive?',
  'Disponível exclusivamente no Plano Anual, o sistema compila todas as configurações do seu perfil, lista de pacientes, histórico de evoluções e relatórios em um único arquivo de segurança. O app gera cópias periódicas automáticas (na frequência diária, semanal ou mensal que você escolher) na sua conta pessoal do Google Drive, mantendo o histórico das últimas 3 versões para restauração inteligente em 1 clique.',
  8
),
(
  'b1100000-0000-0000-0000-000000000003',
  'O que significa a Restauração Inteligente de Backups?',
  'Significa que ao restaurar um backup anterior, o sistema realiza uma mesclagem dos registros clínicos. Pacientes ou evoluções novas que você cadastrou após a data daquele backup não serão perdidos nem apagados, garantindo a integridade dos seus dados clínicos por meio de UUIDs estáveis.',
  9
),
(
  'b1100000-0000-0000-0000-000000000004',
  'Como funciona a inserção do Logotipo Personalizado nos relatórios e evoluções em PDF?',
  'Profissionais assinantes do Plano Anual podem fazer o upload do logotipo de seu consultório ou clínica na tela de Perfil. Uma vez configurado, o logotipo será automaticamente incorporado de forma elegante no cabeçalho de todas as evoluções clínicas assinadas e dos relatórios clínicos gerados para impressão ou exportação em PDF.',
  6
),
(
  'b1100000-0000-0000-0000-000000000005',
  'Como solicitar a Migração VIP de prontuários antigos por IA?',
  'Se você assinar o Plano Anual, tem direito à Migração Assistida por IA sem custo extra. Basta ir na aba de "Migração" no menu lateral e anexar seus prontuários antigos (em formatos como PDF, Word ou planilhas Excel). Nossa equipe técnica, com o auxílio de robôs de IA dedicados, organizará, limpará e importará todo o seu histórico anterior diretamente para o aplicativo.',
  6
)
ON CONFLICT DO NOTHING;
