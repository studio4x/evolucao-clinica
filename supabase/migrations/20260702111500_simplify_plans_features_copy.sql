-- Atualiza a listagem de funcionalidades do Plano Mensal na tabela de planos com copy simplificada
UPDATE public.plans 
SET features = ARRAY[
  'Pacientes ilimitados',
  'Evoluções clínicas com IA ilimitadas',
  'Integração com Google Docs em tempo real',
  'Gravação e transcrição de áudio nativa',
  'Geração de Relatórios & PDI por IA',
  'Pesquisa Inteligente por IA (Pergunte ao Prontuário)',
  'Assinatura Digital de Documentos com Proteção Legal',
  'Compartilhamento Seguro de Relatórios (WhatsApp/E-mail)',
  'Filtro de Período na Impressão do Prontuário',
  'Lembrete e envio de WhatsApp para aniversariantes',
  'Impressão de prontuários do Google Docs'
]
WHERE id = 'monthly';
